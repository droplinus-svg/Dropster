// Spotify OAuth 2.0 mit Authorization Code + PKCE (kein Client-Secret noetig,
// daher sicher fuer eine reine Frontend-App).
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
} from "../config";

const TOKEN_KEY = "dropster.spotify.token";
const VERIFIER_KEY = "dropster.spotify.verifier";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix-ms
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => ("0" + (b & 0xff).toString(16)).slice(-2))
    .join("");
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Schritt 1: Nutzer zu Spotify weiterleiten.
export async function beginLogin(): Promise<void> {
  const verifier = randomString(64);
  const challenge = base64url(await sha256(verifier));
  localStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

// Schritt 2: Nach dem Redirect den Code gegen ein Token tauschen.
export async function handleCallback(code: string): Promise<void> {
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Kein PKCE-Verifier gefunden.");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Token-Austausch fehlgeschlagen: " + res.status);
  const data = await res.json();
  storeToken(data);
  localStorage.removeItem(VERIFIER_KEY);
}

function storeToken(data: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}): void {
  const existing = readStored();
  const token: StoredToken = {
    access_token: data.access_token,
    // Bei einem Refresh liefert Spotify nicht immer ein neues Refresh-Token.
    refresh_token: data.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function readStored(): StoredToken | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as StoredToken) : null;
}

async function refresh(token: StoredToken): Promise<StoredToken> {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    logout();
    throw new Error("Token-Refresh fehlgeschlagen – bitte neu einloggen.");
  }
  storeToken(await res.json());
  return readStored()!;
}

// Liefert ein gueltiges Access-Token (erneuert bei Bedarf).
export async function getAccessToken(): Promise<string | null> {
  let token = readStored();
  if (!token) return null;
  if (Date.now() >= token.expires_at && token.refresh_token) {
    token = await refresh(token);
  }
  return token.access_token;
}

export function isLoggedIn(): boolean {
  return readStored() !== null;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}
