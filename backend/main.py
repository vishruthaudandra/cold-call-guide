"""Cold-call guide backend (FastAPI). Holds the Supabase and LLM keys; the browser never sees them."""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
LLM_KEY = os.environ.get("GEMINI_API_KEY", "")
LLM_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

CONTENT = json.loads((Path(__file__).parent / "stages.json").read_text(encoding="utf-8"))
STAGES = {s["n"]: s for s in CONTENT["stages"]}
OUTCOMES = {o["value"] for o in CONTENT["outcomes"]}
logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Cold-call guide")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])


# ---------- Supabase helpers (PostgREST over HTTPS) ----------
def _headers(extra: Optional[dict] = None) -> dict:
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
    h.update(extra or {})
    return h


async def db(method: str, table: str, *, params=None, body=None, prefer="return=representation"):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(503, "Database is not configured")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.request(method, f"{SUPABASE_URL}/rest/v1/{table}", params=params,
                                 json=body, headers=_headers({"Prefer": prefer}))
    if r.status_code >= 400:
        raise HTTPException(502, f"Database error: {r.text[:200]}")
    return r.json() if r.text else []


async def get_call(call_id: str) -> dict:
    rows = await db("GET", "calls", params={"id": f"eq.{call_id}", "select": "*"})
    if not rows:
        raise HTTPException(404, "Call not found")
    return rows[0]


# ---------- Request models ----------
class StartCall(BaseModel):
    prospect_label: str = Field(min_length=1, max_length=120)


class StageResult(BaseModel):
    stage: int = Field(ge=1, le=8)
    what_happened: Optional[str] = Field(None, max_length=80)
    prospect_words: Optional[str] = Field(None, max_length=2000)
    llm_suggestion: Optional[str] = Field(None, max_length=1000)


class CloseCall(BaseModel):
    outcome: str
    need_words: Optional[str] = Field(None, max_length=2000)
    next_step_note: Optional[str] = Field(None, max_length=500)


class SuggestReq(BaseModel):
    stage: int = Field(ge=1, le=8)
    prospect_words: str = Field(min_length=1, max_length=1000)


# ---------- Endpoints ----------
@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/stages")
async def stages():
    """The screen's content, so frontend and backend share one source."""
    return CONTENT


@app.post("/calls", status_code=201)
async def start_call(body: StartCall):
    rows = await db("POST", "calls", body={"prospect_label": body.prospect_label})
    return rows[0]


@app.post("/calls/{call_id}/stages")
async def save_stage(call_id: str, body: StageResult):
    call = await get_call(call_id)
    if call.get("ended_at"):
        raise HTTPException(409, "Call already closed")
    await db("POST", "stage_results", params={"on_conflict": "call_id,stage"},
             body={"call_id": call_id, **body.model_dump()},
             prefer="resolution=merge-duplicates,return=representation")
    nxt = min(body.stage + 1, 8)
    rows = await db("PATCH", "calls", params={"id": f"eq.{call_id}"},
                    body={"current_stage": nxt, "furthest_stage": max(call["furthest_stage"], body.stage)})
    return rows[0]


@app.post("/calls/{call_id}/close")
async def close_call(call_id: str, body: CloseCall):
    if body.outcome not in OUTCOMES:
        raise HTTPException(422, f"outcome must be one of {sorted(OUTCOMES)}")
    await get_call(call_id)
    rows = await db("PATCH", "calls", params={"id": f"eq.{call_id}"},
                    body={"outcome": body.outcome, "need_words": body.need_words,
                          "next_step_note": body.next_step_note,
                          "ended_at": datetime.now(timezone.utc).isoformat()})
    return rows[0]


@app.get("/calls")
async def list_calls():
    return await db("GET", "calls", params={
        "select": "id,prospect_label,started_at,ended_at,current_stage,furthest_stage,outcome,next_step_note",
        "order": "started_at.desc", "limit": "100"})


@app.post("/suggest")
async def suggest(body: SuggestReq):
    """LLM: given the stage and what the prospect just said, suggest the caller's next line."""
    if not LLM_KEY:
        raise HTTPException(503, "LLM is not configured")
    s = STAGES[body.stage]
    prompt = (
        "You are helping a salesperson on a live cold call. The company is a growth-analysis firm "
        "calling Indian business owners and directors. "
        f'The call is at the stage "{s["name"]}", whose purpose is: {s["purpose"]} '
        f'The prospect just said: "{body.prospect_words}". '
        "Write only the caller's next spoken line, in natural conversational language. "
        "Answer the prospect's specific point directly; do not give generic filler or start with an incomplete phrase. "
        "Use one or two short sentences, no more than 35 words total. Do not include a label, explanation, quotation marks, or stage directions. "
        "Move the conversation one small step toward the purpose of this stage. "
        "If the prospect asks for information, answer briefly and ask one relevant follow-up. "
        "If the prospect declines, acknowledge it respectfully and do not keep selling. "
        "If the prospect used Hindi or Hinglish, reply in the same mix. "
        "Do not invent facts, prices, results, prior contact, consent, or commitments. "
        "If their meaning is unclear, ask one short clarifying question instead of guessing."
    )
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            r = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{LLM_MODEL}:generateContent",
                headers={"x-goog-api-key": LLM_KEY},
                json={"contents": [{"parts": [{"text": prompt}]}],
                      "generationConfig": {"maxOutputTokens": 120, "temperature": 0.4}})
    except httpx.HTTPError as exc:
        logger.error("Gemini request failed before receiving a response (%s)", type(exc).__name__)
        raise HTTPException(502, "Gemini could not be reached. Check the Render service logs.")
    if r.is_error:
        try:
            provider_error = r.json().get("error", {}).get("message", r.reason_phrase)
        except ValueError:
            provider_error = r.reason_phrase
        provider_error = str(provider_error)[:300]
        logger.error("Gemini returned HTTP %s: %s", r.status_code, provider_error)
        raise HTTPException(502, f"Gemini returned HTTP {r.status_code}: {provider_error}")
    try:
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, ValueError):
        logger.error("Gemini response did not contain a text candidate (model=%s)", LLM_MODEL)
        raise HTTPException(502, "Gemini returned no text suggestion. Check the Render service logs.")
    return {"suggestion": text}
