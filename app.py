from __future__ import annotations

import sqlite3
import json
import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from route_planner import GRAPH_PATH, PLACES, RoutePlanner, haversine_m
from auth import connect, create_admin_session, create_session, delete_admin_session, delete_session, get_admin, get_user, hash_password, initialize_database, verify_password
from risk_model import MODEL_PATH

app = FastAPI(title="SmartRoute BD", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
initialize_database()
app.mount("/assets", StaticFiles(directory=Path("frontend/dist/assets"), check_dir=False), name="frontend_assets")
STATIC = Path("static")
FRONTEND_HTML = Path("frontend/dist/index.html")
RIDER_PROFILE_DIR = Path("data/private/rider_profiles")
MAX_RIDER_UPLOAD_BYTES = 8 * 1024 * 1024

planner: RoutePlanner | None = None
live_driver_locations: dict[str, dict[str, float | str]] = {}


class RouteRequest(BaseModel):
    start: str
    destination: str
    weather: str = Field(default="Clear")
    hour: int = Field(default=18, ge=0, le=23)
    month: int = Field(default=9, ge=1, le=12)
    vehicle_type: str = "Motorcycle"
    stops: list[str] = Field(default_factory=list, max_length=6)
    route_mode: str = Field(default="fastest", pattern="^(fastest|shortest)$")
    optimize_stops: bool = True
    avoid_tolls: bool = False
    avoid_high_risk: bool = True


class AuthRequest(BaseModel):
    name: str = ""
    email: str
    password: str


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=5, max_length=300)
    phone: str = Field(default="", max_length=40)
    priority: Literal["Normal", "High Priority", "Urgent", "Express"] = "Normal"
    time_window: str = Field(default="", max_length=80)


class OrderStatusUpdate(BaseModel):
    status: Literal["Pending", "Assigned", "In Transit", "Completed", "Delayed", "Cancelled"]
    failed_reason: str = Field(default="", max_length=300)


class DriverCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(default="", max_length=40)
    vehicle_type: Literal["Motorcycle", "Car", "Van", "Truck"] = "Motorcycle"


class DriverStatusUpdate(BaseModel):
    status: Literal["Available", "Busy", "Offline"]


class DocumentReviewUpdate(BaseModel):
    status: Literal["approved", "rejected", "resubmission_required"]
    reason: str = Field(default="", max_length=500)


class AccountControlUpdate(BaseModel):
    status: Literal["active", "deactivated", "suspended"]
    reason: str = Field(default="", max_length=500)


class RiderProfileUpdate(BaseModel):
    full_name: str = Field(default="", max_length=120)
    date_of_birth: str = Field(default="", max_length=10)
    nid_number: str = Field(default="", max_length=30)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=254)
    address: str = Field(default="", max_length=300)
    emergency_contact_name: str = Field(default="", max_length=120)
    emergency_contact_phone: str = Field(default="", max_length=40)
    blood_group: str = Field(default="", max_length=5)
    vehicle_type: Literal["Motorcycle", "Car", "Van", "Truck"] = "Motorcycle"
    vehicle_make_model: str = Field(default="", max_length=120)
    vehicle_registration: str = Field(default="", max_length=40)
    license_number: str = Field(default="", max_length=40)
    license_expiry: str = Field(default="", max_length=10)


def rider_profile_path(user_id: int) -> Path:
    return RIDER_PROFILE_DIR / f"{user_id}.json"


def load_rider_profile(user_id: int) -> dict[str, Any]:
    path = rider_profile_path(user_id)
    if not path.exists():
        return {"full_name": "", "documents": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Could not load rider profile.") from exc
    data.setdefault("documents", {})
    return data


def rider_verification(profile: dict[str, Any]) -> dict[str, str]:
    documents = profile.get("documents", {})
    required_fields = (
        "full_name",
        "date_of_birth",
        "nid_number",
        "phone",
        "address",
        "vehicle_make_model",
        "vehicle_registration",
        "license_number",
        "license_expiry",
    )
    profile_complete = all(str(profile.get(field, "")).strip() for field in required_fields)
    expiry = str(profile.get("license_expiry", ""))
    try:
        license_expired = bool(expiry) and date.fromisoformat(expiry) < date.today()
    except ValueError:
        license_expired = True
    documents_complete = all(documents.get(key) for key in ("nid_card", "driving_license", "profile_photo"))
    status = "Action required" if license_expired else "Pending review" if profile_complete and documents_complete else "Incomplete"
    return {
        "status": status,
        "nid": "Submitted" if documents.get("nid_card") else "Required",
        "license": "Expired" if license_expired else "Submitted" if documents.get("driving_license") else "Required",
        "photo": "Uploaded" if documents.get("profile_photo") else "Required",
    }


def current_user(authorization: str | None = Header(default=None)) -> dict[str, object]:
    token = authorization.removeprefix("Bearer ").strip() if authorization else None
    user = get_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    with connect() as connection:
        control = connection.execute(
            "SELECT status FROM admin_account_controls WHERE subject_type = 'user' AND subject_id = ?",
            (user["id"],),
        ).fetchone()
    if control and control["status"] != "active":
        raise HTTPException(status_code=403, detail="This account is not active. Contact an administrator.")
    return user


def current_admin(authorization: str | None = Header(default=None)) -> dict[str, object]:
    token = authorization.removeprefix("Bearer ").strip() if authorization else None
    admin = get_admin(token)
    if not admin:
        raise HTTPException(status_code=401, detail="Administrator sign-in is required.")
    return admin


def write_admin_activity(
    admin_id: int | None,
    action: str,
    subject_type: str = "",
    subject_id: int | None = None,
    details: dict[str, object] | None = None,
) -> None:
    with connect() as connection:
        connection.execute(
            "INSERT INTO admin_activity_log (admin_id, action, subject_type, subject_id, details_json) VALUES (?, ?, ?, ?, ?)",
            (admin_id, action, subject_type, subject_id, json.dumps(details or {}, ensure_ascii=False)),
        )


def document_reviews(user_id: int) -> dict[str, dict[str, object]]:
    with connect() as connection:
        rows = connection.execute(
            "SELECT document_type, status, reason, reviewed_by, updated_at FROM rider_document_reviews WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return {row["document_type"]: dict(row) for row in rows}


def admin_rider_summary(user: dict[str, object]) -> dict[str, object]:
    user_id = int(user["id"])
    profile = load_rider_profile(user_id)
    profile.setdefault("documents", {})
    reviews = document_reviews(user_id)
    control = get_account_control("user", user_id)
    baseline = rider_verification(profile)
    required_documents = ("nid_card", "driving_license")
    all_reviewed = all(
        profile["documents"].get(document_type) and reviews.get(document_type, {}).get("status") == "approved"
        for document_type in required_documents
    )
    failed_review = any(
        reviews.get(document_type, {}).get("status") in {"rejected", "resubmission_required"}
        for document_type in required_documents
    )
    if failed_review or baseline["status"] == "Action required":
        verification_status = "action_required"
    elif baseline["status"] == "Incomplete":
        verification_status = "incomplete"
    elif all_reviewed:
        verification_status = "verified"
    else:
        verification_status = "pending_review"
    return {
        "id": user_id,
        "name": profile.get("full_name") or user["name"],
        "email": user["email"],
        "created_at": user["created_at"],
        "phone": profile.get("phone", ""),
        "verification_status": verification_status,
        "account_status": control["status"] if control else "active",
        "nid_number": profile.get("nid_number", ""),
        "license_number": profile.get("license_number", ""),
        "license_expiry": profile.get("license_expiry", ""),
        "vehicle_type": profile.get("vehicle_type", ""),
        "vehicle_make_model": profile.get("vehicle_make_model", ""),
        "vehicle_registration": profile.get("vehicle_registration", ""),
        "documents": profile.get("documents", {}),
        "document_reviews": reviews,
        "profile": profile,
    }


def get_account_control(subject_type: str, subject_id: int) -> dict[str, object] | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT status, reason, updated_at FROM admin_account_controls WHERE subject_type = ? AND subject_id = ?",
            (subject_type, subject_id),
        ).fetchone()
    return dict(row) if row else None


@app.get("/")
def home():
    if FRONTEND_HTML.is_file():
        return FileResponse(FRONTEND_HTML)
    return FileResponse(STATIC / "index.html")


@app.get("/admin", include_in_schema=False)
@app.get("/admin/", include_in_schema=False)
def admin_home():
    if not FRONTEND_HTML.is_file():
        raise HTTPException(status_code=503, detail="Build the frontend before opening the admin site.")
    return FileResponse(FRONTEND_HTML)


@app.get("/api/locations")
def locations():
    return {"locations": list(PLACES.keys())}


@app.get("/api/health")
def health():
    try:
        with connect() as connection:
            connection.execute("SELECT 1")
        database_connected = True
    except sqlite3.Error:
        database_connected = False

    model_available = MODEL_PATH.is_file()
    graph_available = GRAPH_PATH.is_file()
    ready = database_connected and model_available and graph_available
    return {
        "status": "ok" if ready else "degraded",
        "model_available": model_available,
        "model_loaded": planner is not None,
        "graph_available": graph_available,
        "database_connected": database_connected,
        "routing_provider": "OpenStreetMap road routing",
    }


def authenticate_admin(identifier: str, password: str) -> dict[str, object] | None:
    locked = False
    valid = False
    with connect() as connection:
        account = connection.execute(
            "SELECT * FROM admin_accounts WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE",
            (identifier, identifier),
        ).fetchone()
        if account and account["locked_until"]:
            locked = bool(connection.execute("SELECT ? > CURRENT_TIMESTAMP", (account["locked_until"],)).fetchone()[0])
        valid = bool(not locked and account and account["is_active"] and verify_password(password, account["password_hash"]))
        if not valid:
            if account and not locked:
                connection.execute(
                    "UPDATE admin_accounts SET failed_login_count = failed_login_count + 1, locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN datetime('now', '+15 minutes') ELSE locked_until END WHERE id = ?",
                    (account["id"],),
                )
        elif account:
            connection.execute("UPDATE admin_accounts SET failed_login_count = 0, locked_until = NULL WHERE id = ?", (account["id"],))
    if locked:
        raise HTTPException(status_code=429, detail="Sign-in is temporarily locked. Try again later.")
    if not account:
        return None
    if not valid:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    token = create_admin_session(int(account["id"]))
    write_admin_activity(int(account["id"]), "admin.login")
    user = {"id": account["id"], "name": account["username"], "username": account["username"], "email": account["email"], "role": "admin"}
    return {"token": token, "user": user, "role": "admin"}


@app.get("/api/admin/auth/me")
def admin_me(admin: dict[str, object] = Depends(current_admin)) -> dict[str, object]:
    return {"admin": admin}


@app.post("/api/admin/auth/logout")
def admin_logout(
    authorization: str | None = Header(default=None),
    admin: dict[str, object] = Depends(current_admin),
) -> dict[str, str]:
    token = authorization.removeprefix("Bearer ").strip() if authorization else None
    delete_admin_session(token)
    write_admin_activity(int(admin["id"]), "admin.logout")
    return {"status": "ok"}


@app.get("/api/admin/dashboard")
def admin_dashboard(admin: dict[str, object] = Depends(current_admin)) -> dict[str, object]:
    with connect() as connection:
        totals = connection.execute(
            "SELECT (SELECT COUNT(*) FROM users) AS riders, (SELECT COUNT(*) FROM drivers) AS drivers, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM route_history) AS routes, (SELECT COUNT(*) FROM admin_account_controls WHERE status = 'suspended') AS suspended"
        ).fetchone()
        order_rows = connection.execute("SELECT status, COUNT(*) AS total FROM orders GROUP BY status").fetchall()
        route_rows = connection.execute(
            "SELECT date(created_at) AS day, COUNT(*) AS total FROM route_history WHERE date(created_at) >= date('now', '-6 days') GROUP BY date(created_at) ORDER BY day"
        ).fetchall()
        recent = connection.execute(
            "SELECT admin_activity_log.*, admin_accounts.username AS admin_name FROM admin_activity_log LEFT JOIN admin_accounts ON admin_accounts.id = admin_activity_log.admin_id ORDER BY admin_activity_log.created_at DESC LIMIT 8"
        ).fetchall()
    riders = admin_rider_list(search="", verification="", account_status="", sort="created_at", order="desc")
    verification_counts = {key: 0 for key in ("incomplete", "pending_review", "verified", "action_required")}
    pending_documents = 0
    for rider in riders:
        verification_counts[rider["verification_status"]] += 1
        for document_type in ("nid_card", "driving_license"):
            if rider["documents"].get(document_type) and rider["document_reviews"].get(document_type, {}).get("status") != "approved":
                pending_documents += 1
    return {
        "totals": dict(totals),
        "orders_by_status": {row["status"]: row["total"] for row in order_rows},
        "verification": verification_counts,
        "routes_last_7_days": [dict(row) for row in route_rows],
        "recent_admin_activity": [dict(row) for row in recent],
        "pending_documents": pending_documents,
        "admin": {"id": admin["id"], "username": admin["username"]},
    }


def admin_rider_list(search: str, verification: str, account_status: str, sort: str, order: str) -> list[dict[str, object]]:
    with connect() as connection:
        users = connection.execute("SELECT id, name, email, created_at FROM users").fetchall()
    riders = [admin_rider_summary(dict(user)) for user in users]
    normalized = search.strip().casefold()
    if normalized:
        riders = [rider for rider in riders if normalized in " ".join(str(rider[key]) for key in ("name", "email", "phone", "vehicle_registration")).casefold()]
    if verification:
        riders = [rider for rider in riders if rider["verification_status"] == verification]
    if account_status:
        riders = [rider for rider in riders if rider["account_status"] == account_status]
    sort_keys = {"name": "name", "email": "email", "created_at": "created_at", "verification_status": "verification_status", "account_status": "account_status"}
    riders.sort(key=lambda rider: str(rider[sort_keys.get(sort, "created_at")]).casefold(), reverse=order == "desc")
    return riders


@app.get("/api/admin/riders")
def admin_riders(
    search: str = "",
    verification: str = "",
    account_status: str = "",
    sort: str = "created_at",
    order: Literal["asc", "desc"] = "desc",
    admin: dict[str, object] = Depends(current_admin),
) -> dict[str, object]:
    riders = admin_rider_list(search, verification, account_status, sort, order)
    return {"riders": [{key: value for key, value in rider.items() if key not in {"profile", "documents", "document_reviews"}} for rider in riders], "total": len(riders)}


@app.get("/api/admin/riders/{rider_id}")
def admin_rider_detail(rider_id: int, admin: dict[str, object] = Depends(current_admin)) -> dict[str, object]:
    with connect() as connection:
        user = connection.execute("SELECT id, name, email, created_at FROM users WHERE id = ?", (rider_id,)).fetchone()
        routes = connection.execute("SELECT * FROM route_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", (rider_id,)).fetchall()
        orders = connection.execute("SELECT * FROM orders WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 50", (rider_id,)).fetchall()
    if not user:
        raise HTTPException(status_code=404, detail="Rider not found.")
    return {"rider": admin_rider_summary(dict(user)), "routes": [dict(row) for row in routes], "orders": [dict(row) for row in orders]}


@app.get("/api/admin/riders/{rider_id}/documents/{document_type}")
def admin_download_rider_document(
    rider_id: int,
    document_type: Literal["nid_card", "driving_license", "profile_photo"],
    admin: dict[str, object] = Depends(current_admin),
) -> FileResponse:
    profile = load_rider_profile(rider_id)
    document = profile.get("documents", {}).get(document_type)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    file_name = Path(str(document.get("file_name", ""))).name
    path = RIDER_PROFILE_DIR / str(rider_id) / file_name
    if not file_name or not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")
    return FileResponse(path, filename=Path(str(document.get("original_name", file_name))).name, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@app.patch("/api/admin/riders/{rider_id}/documents/{document_type}")
def review_rider_document(
    rider_id: int,
    document_type: Literal["nid_card", "driving_license"],
    update: DocumentReviewUpdate,
    admin: dict[str, object] = Depends(current_admin),
) -> dict[str, object]:
    if update.status in {"rejected", "resubmission_required"} and not update.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required for this decision.")
    with connect() as connection:
        rider = connection.execute("SELECT id, name, email, created_at FROM users WHERE id = ?", (rider_id,)).fetchone()
    profile = load_rider_profile(rider_id)
    document = profile.get("documents", {}).get(document_type)
    document_name = Path(str((document or {}).get("file_name", ""))).name
    document_path = RIDER_PROFILE_DIR / str(rider_id) / document_name
    if not rider or not document_name or not document_path.is_file():
        raise HTTPException(status_code=404, detail="Rider document not found.")
    with connect() as connection:
        connection.execute(
            "INSERT INTO rider_document_reviews (user_id, document_type, status, reason, reviewed_by, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, document_type) DO UPDATE SET status = excluded.status, reason = excluded.reason, reviewed_by = excluded.reviewed_by, updated_at = CURRENT_TIMESTAMP",
            (rider_id, document_type, update.status, update.reason.strip(), admin["id"]),
        )
    write_admin_activity(int(admin["id"]), f"document.{update.status}", "rider", rider_id, {"document_type": document_type, "reason": update.reason.strip()})
    return {"rider": admin_rider_summary(dict(rider))}


@app.get("/api/admin/drivers")
def admin_drivers(
    search: str = "",
    status: str = "",
    sort: Literal["name", "created_at", "status"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    admin: dict[str, object] = Depends(current_admin),
) -> dict[str, object]:
    with connect() as connection:
        rows = connection.execute("SELECT drivers.*, users.name AS owner_name, users.email AS owner_email FROM drivers LEFT JOIN users ON users.id = drivers.owner_user_id").fetchall()
    result = []
    normalized = search.strip().casefold()
    for row in rows:
        driver = dict(row)
        control = get_account_control("driver", int(driver["id"]))
        driver["account_status"] = control["status"] if control else "active"
        driver["account_reason"] = control["reason"] if control else ""
        if status and driver["account_status"] != status:
            continue
        if normalized and normalized not in " ".join(str(driver[key] or "") for key in ("name", "phone", "vehicle_type", "owner_name", "owner_email")).casefold():
            continue
        result.append(driver)
    result.sort(key=lambda driver: str(driver[sort] or "").casefold(), reverse=order == "desc")
    return {"drivers": result, "total": len(result)}


@app.get("/api/admin/drivers/{driver_id}")
def admin_driver_detail(driver_id: int, admin: dict[str, object] = Depends(current_admin)) -> dict[str, object]:
    with connect() as connection:
        driver = connection.execute("SELECT drivers.*, users.name AS owner_name, users.email AS owner_email FROM drivers LEFT JOIN users ON users.id = drivers.owner_user_id WHERE drivers.id = ?", (driver_id,)).fetchone()
        orders = connection.execute("SELECT * FROM orders WHERE driver_id = ? ORDER BY created_at DESC LIMIT 50", (driver_id,)).fetchall()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found.")
    driver_data = dict(driver)
    control = get_account_control("driver", driver_id)
    driver_data["account_status"] = control["status"] if control else "active"
    return {"driver": driver_data, "account_control": control, "orders": [dict(row) for row in orders]}


@app.patch("/api/admin/accounts/{subject_type}/{subject_id}")
def admin_update_account(
    subject_type: Literal["user", "driver"],
    subject_id: int,
    update: AccountControlUpdate,
    admin: dict[str, object] = Depends(current_admin),
) -> dict[str, object]:
    table = "users" if subject_type == "user" else "drivers"
    with connect() as connection:
        target = connection.execute(f"SELECT id FROM {table} WHERE id = ?", (subject_id,)).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="Account not found.")
        if update.status == "active":
            connection.execute("DELETE FROM admin_account_controls WHERE subject_type = ? AND subject_id = ?", (subject_type, subject_id))
        else:
                if update.status != "active" and not update.reason.strip():
                    raise HTTPException(status_code=400, detail="A reason is required when restricting an account.")
                connection.execute(
                    "INSERT INTO admin_account_controls (subject_type, subject_id, status, reason, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(subject_type, subject_id) DO UPDATE SET status = excluded.status, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP",
                    (subject_type, subject_id, update.status, update.reason.strip(), admin["id"]),
                )
    write_admin_activity(int(admin["id"]), f"account.{update.status}", subject_type, subject_id, {"reason": update.reason.strip()})
    return {"subject_type": subject_type, "subject_id": subject_id, "status": update.status, "reason": update.reason.strip()}


@app.get("/api/admin/activity")
def admin_activity(limit: int = 100, admin: dict[str, object] = Depends(current_admin)) -> dict[str, object]:
    limit = min(max(limit, 1), 250)
    with connect() as connection:
        audit = connection.execute("SELECT admin_activity_log.*, admin_accounts.username AS admin_name FROM admin_activity_log LEFT JOIN admin_accounts ON admin_accounts.id = admin_activity_log.admin_id ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        routes = connection.execute("SELECT route_history.id, route_history.created_at, route_history.start_name, route_history.destination_name, route_history.distance_km, route_history.overall_risk, users.name, users.email FROM route_history JOIN users ON users.id = route_history.user_id ORDER BY route_history.created_at DESC LIMIT ?", (limit,)).fetchall()
        orders = connection.execute("SELECT orders.id, orders.created_at, orders.order_code, orders.status, orders.priority, users.name, users.email FROM orders LEFT JOIN users ON users.id = orders.owner_user_id ORDER BY orders.created_at DESC LIMIT ?", (limit,)).fetchall()
    events = [{"id": f"admin-{row['id']}", "kind": "admin", "created_at": row["created_at"], "actor": row["admin_name"] or "Admin", "action": row["action"], "subject_type": row["subject_type"], "subject_id": row["subject_id"], "details": json.loads(row["details_json"] or "{}")} for row in audit]
    events.extend({"id": f"route-{row['id']}", "kind": "route", "created_at": row["created_at"], "actor": row["name"] or row["email"] or "Rider", "action": f"Route planned: {row['start_name']} to {row['destination_name']}", "subject_type": "rider", "subject_id": None, "details": {"distance_km": row["distance_km"], "risk": row["overall_risk"]}} for row in routes)
    events.extend({"id": f"order-{row['id']}", "kind": "order", "created_at": row["created_at"], "actor": row["name"] or row["email"] or "Account", "action": f"Order {row['order_code']} · {row['status']}", "subject_type": "order", "subject_id": row["id"], "details": {"priority": row["priority"]}} for row in orders)
    events.sort(key=lambda event: event["created_at"], reverse=True)
    return {"events": events[:limit]}


@app.post("/api/auth/signup")
def signup(req: AuthRequest) -> dict[str, object]:
    name = req.name.strip()
    email = req.email.strip().lower()
    if len(name) < 2 or "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid name and email.")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    try:
        with connect() as connection:
            cursor = connection.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", (name, email, hash_password(req.password)))
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with that email already exists.") from exc
    token = create_session(int(user_id))
    return {"token": token, "user": {"id": user_id, "name": name, "email": email}}


@app.post("/api/auth/login")
def login(req: AuthRequest) -> dict[str, object]:
    email = req.email.strip().lower()
    admin = authenticate_admin(email, req.password)
    if admin:
        return admin
    with connect() as connection:
        row = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    control = get_account_control("user", int(row["id"]))
    if control and control["status"] != "active":
        raise HTTPException(status_code=403, detail="This account is not active. Contact an administrator.")
    token = create_session(row["id"])
    return {"token": token, "role": "rider", "user": {"id": row["id"], "name": row["name"], "email": row["email"], "role": "rider"}}


@app.get("/api/auth/me")
def me(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    return {"user": user}


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    token = authorization.removeprefix("Bearer ").strip() if authorization else None
    delete_session(token)
    return {"status": "ok"}


@app.post("/api/route")
def route(req: RouteRequest, user: dict[str, object] = Depends(current_user)) -> dict[str, Any]:
    global planner

    if req.start == req.destination:
        raise HTTPException(status_code=400, detail="Start and destination must be different.")
    if req.start not in PLACES or req.destination not in PLACES or any(stop not in PLACES for stop in req.stops):
        raise HTTPException(status_code=400, detail="Unknown location.")

    try:
        if planner is None:
            planner = RoutePlanner()
        result = planner.route(
            req.start,
            req.destination,
            {
                "weather": req.weather,
                "hour": req.hour,
                "month": req.month,
                "vehicle_type": req.vehicle_type,
                "route_mode": req.route_mode,
                "optimize_stops": req.optimize_stops,
                "avoid_tolls": req.avoid_tolls,
                "avoid_high_risk": req.avoid_high_risk,
            },
            req.stops,
        )
        with connect() as connection:
            connection.execute(
                "INSERT INTO route_history (user_id, start_name, destination_name, stops_json, distance_km, duration_min, overall_risk) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (user["id"], result["start"], result["destination"], json.dumps(result["stops"]), result["distance_km"], result["duration_min"], result["overall_risk"]),
            )
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/route/recalculate")
def recalculate_route(req: dict[str, Any], user: dict[str, object] = Depends(current_user)) -> dict[str, Any]:
    global planner

    if req.get("destination") not in PLACES:
        raise HTTPException(status_code=400, detail="Unknown destination.")
    latitude = float(req.get("latitude", 0.0))
    longitude = float(req.get("longitude", 0.0))
    destination = str(req["destination"])
    start_name = min(PLACES, key=lambda name: haversine_m((latitude, longitude), PLACES[name]))

    try:
        if planner is None:
            planner = RoutePlanner()
        result = planner.route(
            start_name,
            destination,
            {
                "weather": req.get("weather", "Clear"),
                "hour": int(req.get("hour", 18)),
                "month": int(req.get("month", 9)),
                "vehicle_type": req.get("vehicle_type", "Motorcycle"),
                "route_mode": req.get("route_mode", "fastest"),
                "optimize_stops": bool(req.get("optimize_stops", True)),
                "avoid_tolls": bool(req.get("avoid_tolls", False)),
                "avoid_high_risk": bool(req.get("avoid_high_risk", True)),
            },
            [],
        )
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/driver/location")
def get_driver_location(user: dict[str, object] = Depends(current_user)) -> dict[str, Any]:
    if not live_driver_locations:
        return {"available": False, "message": "Location permission is required to enable live tracking."}
    return {"available": True, **live_driver_locations.get("latest", {})}


@app.post("/api/driver/location")
def save_driver_location(req: dict[str, Any], user: dict[str, object] = Depends(current_user)) -> dict[str, Any]:
    latitude = float(req.get("latitude"))
    longitude = float(req.get("longitude"))
    live_driver_locations["latest"] = {
        "latitude": latitude,
        "longitude": longitude,
        "timestamp": datetime.now().isoformat(),
        "status": "tracking",
    }
    return {"status": "ok", "location": live_driver_locations["latest"]}


@app.get("/api/dashboard")
def dashboard(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with connect() as connection:
        stats = connection.execute("SELECT status, COUNT(*) AS total FROM orders WHERE owner_user_id = ? GROUP BY status", (user["id"],)).fetchall()
        route_stats = connection.execute("SELECT COUNT(*) AS total, COALESCE(AVG(distance_km), 0) AS distance, COALESCE(AVG(duration_min), 0) AS duration FROM route_history WHERE user_id = ?", (user["id"],)).fetchone()
        driver_stats = connection.execute("SELECT status, COUNT(*) AS total FROM drivers WHERE owner_user_id = ? GROUP BY status", (user["id"],)).fetchall()
    delivery_counts = {row["status"]: row["total"] for row in stats}
    return {
        "deliveries": {"total": sum(delivery_counts.values()), "completed": delivery_counts.get("Completed", 0), "pending": delivery_counts.get("Pending", 0), "delayed": delivery_counts.get("Delayed", 0), "cancelled": delivery_counts.get("Cancelled", 0)},
        "performance": {"average_distance_km": round(route_stats["distance"], 2), "average_duration_min": round(route_stats["duration"], 1), "on_time_rate": 100 if delivery_counts.get("Completed", 0) else 0},
        "drivers": {row["status"].lower(): row["total"] for row in driver_stats},
    }


@app.get("/api/rider-profile")
def get_rider_profile(user: dict[str, object] = Depends(current_user)) -> JSONResponse:
    profile = load_rider_profile(int(user["id"]))
    if not profile.get("full_name"):
        profile["full_name"] = str(user["name"])
    if not profile.get("email"):
        profile["email"] = str(user["email"])
    verification = rider_verification(profile)
    reviews = document_reviews(int(user["id"]))
    for key in ("nid_card", "driving_license"):
        review = reviews.get(key)
        if review:
            verification["nid" if key == "nid_card" else "license"] = review["status"].replace("_", " ").title()
    if any(reviews.get(key, {}).get("status") in {"rejected", "resubmission_required"} for key in ("nid_card", "driving_license")):
        verification["status"] = "Action required"
    elif all(reviews.get(key, {}).get("status") == "approved" for key in ("nid_card", "driving_license")) and rider_verification(profile)["status"] == "Pending review":
        verification["status"] = "Verified"
    elif verification["status"] != "Incomplete":
        verification["status"] = "Pending review"
    return JSONResponse(
        {"profile": profile, "verification": verification},
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@app.put("/api/rider-profile")
def update_rider_profile(update: RiderProfileUpdate, user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    profile = load_rider_profile(int(user["id"]))
    values = update.dict()
    for key in ("date_of_birth", "license_expiry"):
        if values[key]:
            try:
                date.fromisoformat(values[key])
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=f"{key.replace('_', ' ').capitalize()} must be a valid date.") from exc
    values = {key: value.strip() if isinstance(value, str) else value for key, value in values.items()}
    values["documents"] = profile.get("documents", {})
    directory = RIDER_PROFILE_DIR
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    path = rider_profile_path(int(user["id"]))
    temporary_path = path.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")
    temporary_path.chmod(0o600)
    temporary_path.replace(path)
    return {"profile": values, "verification": rider_verification(values)}


@app.post("/api/rider-profile/documents/{document_type}")
def upload_rider_document(
    document_type: Literal["nid_card", "driving_license", "profile_photo"],
    file: UploadFile = File(...),
    user: dict[str, object] = Depends(current_user),
) -> dict[str, object]:
    extensions = {
        "nid_card": {".pdf", ".jpg", ".jpeg", ".png"},
        "driving_license": {".pdf", ".jpg", ".jpeg", ".png"},
        "profile_photo": {".jpg", ".jpeg", ".png", ".webp"},
    }
    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()
    if extension not in extensions[document_type]:
        raise HTTPException(status_code=415, detail="Use PDF, JPG, or PNG for documents and JPG, PNG, or WEBP for a profile photo.")
    contents = file.file.read(MAX_RIDER_UPLOAD_BYTES + 1)
    if not contents or len(contents) > MAX_RIDER_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Files must be smaller than 8 MB.")
    signatures = {
        ".pdf": contents.startswith(b"%PDF-"),
        ".jpg": contents.startswith(b"\xff\xd8\xff"),
        ".jpeg": contents.startswith(b"\xff\xd8\xff"),
        ".png": contents.startswith(b"\x89PNG\r\n\x1a\n"),
        ".webp": contents.startswith(b"RIFF") and contents[8:12] == b"WEBP",
    }
    if not signatures[extension]:
        raise HTTPException(status_code=415, detail="The file content does not match its extension.")

    user_directory = RIDER_PROFILE_DIR / str(int(user["id"]))
    user_directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    user_directory.chmod(0o700)
    stored_name = f"{document_type}-{secrets.token_hex(16)}{extension}"
    stored_path = user_directory / stored_name
    stored_path.write_bytes(contents)
    stored_path.chmod(0o600)

    profile = load_rider_profile(int(user["id"]))
    previous_document = profile.setdefault("documents", {}).get(document_type)
    profile["documents"][document_type] = {
        "file_name": stored_name,
        "original_name": original_name[:200],
        "size": len(contents),
        "uploaded_at": datetime.now().isoformat(timespec="seconds"),
    }
    profile_path = rider_profile_path(int(user["id"]))
    profile_path.write_text(json.dumps(profile, ensure_ascii=False), encoding="utf-8")
    profile_path.chmod(0o600)
    if document_type in {"nid_card", "driving_license"}:
        with connect() as connection:
            connection.execute("DELETE FROM rider_document_reviews WHERE user_id = ? AND document_type = ?", (int(user["id"]), document_type))
    if previous_document:
        old_name = Path(str(previous_document.get("file_name", ""))).name
        old_path = user_directory / old_name
        if old_name and old_path != stored_path and old_path.is_file():
            old_path.unlink()
    return {"profile": profile, "verification": rider_verification(profile)}


@app.get("/api/rider-profile/documents/{document_type}")
def download_rider_document(
    document_type: Literal["nid_card", "driving_license", "profile_photo"],
    user: dict[str, object] = Depends(current_user),
) -> FileResponse:
    profile = load_rider_profile(int(user["id"]))
    document = profile.get("documents", {}).get(document_type)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    file_name = Path(str(document.get("file_name", ""))).name
    document_path = RIDER_PROFILE_DIR / str(int(user["id"])) / file_name
    if not file_name or not document_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")
    return FileResponse(
        document_path,
        filename=Path(str(document.get("original_name", file_name))).name,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.get("/api/orders")
def orders(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with connect() as connection:
        rows = connection.execute("SELECT orders.*, drivers.name AS driver_name FROM orders LEFT JOIN drivers ON drivers.id = orders.driver_id WHERE orders.owner_user_id = ? ORDER BY orders.created_at DESC LIMIT 50", (user["id"],)).fetchall()
    return {"orders": [dict(row) for row in rows]}


@app.post("/api/orders")
def create_order(order: OrderCreate, user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    code = f"SR-{datetime.now().strftime('%y%m%d%H%M%S')}-{secrets.token_hex(2).upper()}"
    with connect() as connection:
        cursor = connection.execute("INSERT INTO orders (owner_user_id, order_code, customer_name, address, phone, priority, time_window) VALUES (?, ?, ?, ?, ?, ?, ?)", (user["id"], code, order.customer_name.strip(), order.address.strip(), order.phone.strip(), order.priority, order.time_window.strip()))
        row = connection.execute("SELECT * FROM orders WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"order": dict(row)}


@app.get("/api/drivers")
def drivers(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with connect() as connection:
        rows = connection.execute("SELECT * FROM drivers WHERE owner_user_id = ? ORDER BY name", (user["id"],)).fetchall()
    return {"drivers": [dict(row) for row in rows]}


@app.post("/api/drivers")
def create_driver(driver: DriverCreate, user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with connect() as connection:
        cursor = connection.execute("INSERT INTO drivers (owner_user_id, name, phone, vehicle_type) VALUES (?, ?, ?, ?)", (user["id"], driver.name.strip(), driver.phone.strip(), driver.vehicle_type))
        row = connection.execute("SELECT * FROM drivers WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"driver": dict(row)}


@app.patch("/api/drivers/{driver_id}/status")
def update_driver_status(driver_id: int, update: DriverStatusUpdate, user: dict[str, object] = Depends(current_user)) -> dict[str, str]:
    with connect() as connection:
        control = connection.execute("SELECT status FROM admin_account_controls WHERE subject_type = 'driver' AND subject_id = ?", (driver_id,)).fetchone()
        if control and control["status"] != "active":
            raise HTTPException(status_code=403, detail="This driver account is not active.")
        active_order = connection.execute("SELECT 1 FROM orders WHERE driver_id = ? AND owner_user_id = ? AND status IN ('Assigned', 'In Transit') LIMIT 1", (driver_id, user["id"])).fetchone()
        if active_order and update.status != "Busy":
            raise HTTPException(status_code=409, detail="This driver has an active delivery and must remain Busy.")
        cursor = connection.execute("UPDATE drivers SET status = ? WHERE id = ? AND owner_user_id = ?", (update.status, driver_id, user["id"]))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return {"status": update.status}


@app.post("/api/orders/{order_id}/assign")
def assign_driver(order_id: int, driver_id: int, user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with connect() as connection:
        order = connection.execute("SELECT id, status, driver_id FROM orders WHERE id = ? AND owner_user_id = ?", (order_id, user["id"])).fetchone()
        driver = connection.execute("SELECT id, status FROM drivers WHERE id = ? AND owner_user_id = ?", (driver_id, user["id"])).fetchone()
        driver_control = connection.execute("SELECT status FROM admin_account_controls WHERE subject_type = 'driver' AND subject_id = ?", (driver_id,)).fetchone()
        if not order or not driver:
            raise HTTPException(status_code=404, detail="Order or driver not found.")
        if driver_control and driver_control["status"] != "active":
            raise HTTPException(status_code=409, detail="This driver account is not active.")
        if driver["status"] != "Available":
            raise HTTPException(status_code=409, detail="Choose an available driver.")
        if order["status"] in {"Completed", "Cancelled"}:
            raise HTTPException(status_code=409, detail="This order can no longer be assigned.")
        if order["driver_id"] and order["driver_id"] != driver_id:
            connection.execute("UPDATE drivers SET status = 'Available' WHERE id = ?", (order["driver_id"],))
        connection.execute("UPDATE orders SET driver_id = ?, status = 'Assigned' WHERE id = ?", (driver_id, order_id))
        connection.execute("UPDATE drivers SET status = 'Busy' WHERE id = ?", (driver_id,))
        row = connection.execute("SELECT orders.*, drivers.name AS driver_name FROM orders JOIN drivers ON drivers.id = orders.driver_id WHERE orders.id = ?", (order_id,)).fetchone()
    return {"order": dict(row)}


@app.patch("/api/orders/{order_id}/status")
def update_order_status(order_id: int, update: OrderStatusUpdate, user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    if update.status == "Delayed" and not update.failed_reason.strip():
        raise HTTPException(status_code=400, detail="Add a reason when marking a delivery delayed.")
    with connect() as connection:
        order = connection.execute("SELECT id, driver_id, status FROM orders WHERE id = ? AND owner_user_id = ?", (order_id, user["id"])).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found.")
        transitions = {
            "Pending": {"Assigned", "Cancelled"},
            "Assigned": {"In Transit", "Delayed", "Cancelled"},
            "In Transit": {"Completed", "Delayed", "Cancelled"},
            "Delayed": {"Cancelled"},
            "Completed": set(),
            "Cancelled": set(),
        }
        if update.status not in transitions[order["status"]]:
            raise HTTPException(status_code=409, detail=f"Cannot move a {order['status']} order to {update.status}.")
        connection.execute("UPDATE orders SET status = ?, failed_reason = ? WHERE id = ?", (update.status, update.failed_reason.strip() or None, order_id))
        if order["driver_id"] and update.status in {"Completed", "Delayed", "Cancelled"}:
            connection.execute("UPDATE drivers SET status = 'Available' WHERE id = ?", (order["driver_id"],))
        row = connection.execute("SELECT orders.*, drivers.name AS driver_name FROM orders LEFT JOIN drivers ON drivers.id = orders.driver_id WHERE orders.id = ?", (order_id,)).fetchone()
    return {"order": dict(row)}


@app.get("/api/routes/history")
def route_history(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with connect() as connection:
        rows = connection.execute("SELECT * FROM route_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", (user["id"],)).fetchall()
    return {"routes": [dict(row) for row in rows]}
