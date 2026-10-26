from fastapi import APIRouter, Depends, HTTPException, Response

from lib.audit import audit, now_iso
from lib.auth import COOKIE, ROLE_LABELS, current_user, hash_pw, make_token, permissions_for, require, verify_pw
from lib.db import db
from models.schemas import (AuditEntry, Family, FamilyIn, LoginIn, Manufacturer, ManufacturerIn, PasswordChangeIn,
                            UserCreate, UserOut, UserPatch, new_id)

router = APIRouter()


def user_out(u: dict) -> UserOut:
    return UserOut(id=u["id"], name=u["name"], email=u["email"], role=u["role"], role_label=ROLE_LABELS[u["role"]],
                   active=u.get("active", True), permissions=permissions_for(u["role"]))


CONTROLLER_EMAIL = "controlador@hydro.com"
VISITOR_EMAIL = "visitante@hydro.com"


def _open_session(response: Response, u: dict) -> None:
    response.set_cookie(COOKIE, make_token(u["id"]), httponly=True, samesite="lax", secure=True, max_age=12 * 3600, path="/")


@router.post("/auth/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    """Controller login (password). Visitor has no password — see /auth/visitor."""
    email = (body.email or CONTROLLER_EMAIL).strip().lower()
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if not u or u["role"] != "controlador" or not verify_pw(body.password, u.get("password_hash") or ""):
        raise HTTPException(401, "Senha inválida")
    if not u.get("active", True):
        raise HTTPException(403, "Usuário inativo")
    _open_session(response, u)
    await audit(u, "LOGIN", "usuario", u["id"], f"Login de {u['name']} (Controlador)")
    return user_out(u)


@router.post("/auth/visitor", response_model=UserOut)
async def visitor_login(response: Response):
    """Read-only visitor session, no password."""
    u = await db.users.find_one({"email": VISITOR_EMAIL, "role": "visitante"}, {"_id": 0})
    if not u or not u.get("active", True):
        raise HTTPException(403, "Acesso de visitante desativado")
    _open_session(response, u)
    return user_out(u)


@router.post("/auth/change-password")
async def change_password(body: PasswordChangeIn, user: dict = Depends(require("usuarios"))):
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not verify_pw(body.current_password, full.get("password_hash") or ""):
        raise HTTPException(422, "Senha atual incorreta")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await audit(user, "ALTERACAO", "usuario", user["id"], "Senha do Controlador alterada")
    return {"ok": True}


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return user_out(user)


# ---------- users ----------
@router.get("/users", response_model=list[UserOut])
async def list_users(_: dict = Depends(require("usuarios"))):
    return [user_out(u) for u in await db.users.find({}, {"_id": 0}).sort("name", 1).to_list(500)]


@router.post("/users", response_model=UserOut)
async def create_user(body: UserCreate, user: dict = Depends(require("usuarios"))):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "E-mail já cadastrado")
    doc = {"id": new_id(), "name": body.name, "email": email, "role": body.role, "active": True,
           "password_hash": hash_pw(body.password), "created_at": now_iso()}
    await db.users.insert_one(dict(doc))
    await audit(user, "INCLUSAO", "usuario", doc["id"], f"Usuário {email} criado com perfil {ROLE_LABELS[body.role]}")
    return user_out(doc)


@router.patch("/users/{uid}", response_model=UserOut)
async def patch_user(uid: str, body: UserPatch, user: dict = Depends(require("usuarios"))):
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    upd = body.model_dump(exclude_none=True)
    if uid == user["id"] and (upd.get("active") is False or upd.get("role", "controlador") != "controlador"):
        raise HTTPException(409, "Não é possível remover o próprio acesso de Controlador")
    await db.users.update_one({"id": uid}, {"$set": upd})
    await audit(user, "ALTERACAO", "usuario", uid, f"Usuário {u['email']} alterado", before={k: u.get(k) for k in upd}, after=upd)
    return user_out({**u, **upd})


# ---------- audit ----------
@router.get("/audit", response_model=list[AuditEntry])
async def list_audit(entity: str | None = None, q: str | None = None, _: dict = Depends(require("auditoria"))):
    flt: dict = {}
    if entity:
        flt["entity"] = entity
    if q:
        flt["$or"] = [{"summary": {"$regex": q, "$options": "i"}}, {"user_name": {"$regex": q, "$options": "i"}}]
    return await db.audit_log.find(flt, {"_id": 0}).sort("at", -1).to_list(400)


# ---------- manufacturers ----------
@router.get("/manufacturers", response_model=list[Manufacturer])
async def list_manufacturers(_: dict = Depends(current_user)):
    return await db.manufacturers.find({}, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/manufacturers", response_model=Manufacturer)
async def create_manufacturer(body: ManufacturerIn, user: dict = Depends(require("metas"))):
    name = body.name.strip()
    if await db.manufacturers.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}):
        raise HTTPException(409, "Fabricante já cadastrado")
    m = Manufacturer(name=name, created_at=now_iso())
    await db.manufacturers.insert_one(m.model_dump())
    await audit(user, "INCLUSAO", "fabricante", m.id, f"Fabricante {name} cadastrado")
    return m


# ---------- families / life targets ----------
@router.get("/families", response_model=list[Family])
async def list_families(_: dict = Depends(current_user)):
    return await db.families.find({}, {"_id": 0}).sort("name", 1).to_list(500)


def _check_targets(t: list) -> None:
    for i, v in enumerate(t):
        if v is not None and v <= 0:
            raise HTTPException(422, f"Meta da {i + 1}ª vida deve ser positiva ou 'não definida'")


@router.post("/families", response_model=Family)
async def create_family(body: FamilyIn, user: dict = Depends(require("metas"))):
    _check_targets(body.targets)
    if await db.families.find_one({"name": body.name}):
        raise HTTPException(409, "Família já cadastrada")
    f = Family(**body.model_dump(), updated_at=now_iso(), updated_by=user["name"])
    await db.families.insert_one(f.model_dump())
    await audit(user, "INCLUSAO", "familia", f.id, f"Família {f.name} criada, metas {f.targets}")
    return f


@router.put("/families/{fid}", response_model=Family)
async def update_family(fid: str, body: FamilyIn, user: dict = Depends(require("metas"))):
    _check_targets(body.targets)
    old = await db.families.find_one({"id": fid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Família não encontrada")
    upd = {**body.model_dump(), "updated_at": now_iso(), "updated_by": user["name"]}
    await db.families.update_one({"id": fid}, {"$set": upd})
    await audit(user, "ALTERACAO_META", "familia", fid, f"Metas da família {body.name}: {old['targets']} → {body.targets}",
                before=old, after=upd)
    return Family(**{**old, **upd})
