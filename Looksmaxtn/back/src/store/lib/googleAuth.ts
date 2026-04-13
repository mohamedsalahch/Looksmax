import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const GOOGLE_CERTS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_JWKS = createRemoteJWKSet(GOOGLE_CERTS_URL);

export interface GoogleIdTokenPayload extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export async function verifyGoogleIdToken(credential: string) {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    return { error: "Google sign-in is not configured." };
  }

  try {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      audience: googleClientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });

    return { payload: payload as GoogleIdTokenPayload };
  } catch {
    return { error: "Invalid Google sign-in token." };
  }
}
