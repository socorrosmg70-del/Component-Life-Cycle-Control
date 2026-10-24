"""Session auth (httpOnly JWT cookie) + role permissions."""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from lib.db import db

SECRET = os.environ.get("JWT_SECRET", "lcc-hydro-dev-secret-change-in-prod")
COOKIE = "lcc_session"

ROLE_LABELS = {
    "admin": "Administrador",
    "pcm": "PCM",
    "engenharia": "Engenharia / Confiabilidade",
    "oficina": "Oficina",
    "consulta": "Usuário de consulta",
    "gestor": "Gestor",
}

# permission -> roles allowed. Read access is open to every authenticated role.
PERMS: dict[str, set[str]] = {
    "cadastro": {"admin", "pcm"},
    "movimentacao": {"admin", "pcm", "oficina"},
    "validar_vida": {"admin", "engenharia"},
    "reforma": {"admin", "pcm", "oficina"},
    "concluir_reforma": {"admin", "oficina", "engenharia"},
    "custos": {"admin", "pcm", "engenharia"},
    "sap": {"admin", "pcm"},
    "metas": {"admin"},
    "correcao": {"admin", "pcm"},
    "usuarios": {"admin"},
    "auditoria": {"admin", "gestor", "engenharia"},
}


def permissions_for(role: str) -> list[str]:
    return sorted(p for p, roles in PERMS.items() if role in roles)


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=12)
    return jwt.encode({"sub": user_id, "exp": exp}, SECRET, algorithm="HS256")


async def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sessão expirada")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(401, "Usuário inativo")
    return user


def require(perm: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in PERMS[perm]:
            raise HTTPException(
                403, f"Perfil '{ROLE_LABELS.get(user['role'], user['role'])}' sem permissão para esta operação"
            )
        return user

    return dep
