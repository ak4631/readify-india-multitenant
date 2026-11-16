import "server-only";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export function firebasePushMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const splitCredentials = !!(clientEmail || privateKey);
  const useDefaultCredentials =
    process.env.FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS === "true";
  if (!splitCredentials && !useDefaultCredentials) return null;
  if (splitCredentials && (!projectId || !clientEmail || !privateKey)) {
    throw new Error(
      "Firebase Admin requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY",
    );
  }

  const name = "zerotham-push";
  let app = getApps().find((candidate) => candidate.name === name);
  if (!app) {
    let credential;
    if (splitCredentials) {
      try {
        credential = cert({
          projectId: projectId!,
          clientEmail: clientEmail!,
          // Supports both actual newlines and literal \n in deployment secrets.
          privateKey: privateKey!.replace(/\\n/g, "\n"),
        });
      } catch {
        throw new Error("Firebase Admin environment credentials are invalid");
      }
    } else credential = applicationDefault();
    app = initializeApp(
      { credential, ...(projectId ? { projectId } : {}) },
      name,
    );
  }
  return getMessaging(app);
}
