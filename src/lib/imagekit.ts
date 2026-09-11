import "server-only";
import ImageKit from "@imagekit/nodejs";
import type { DocumentType } from "@/generated/prisma/enums";

function getClient(): ImageKit {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("IMAGEKIT_PRIVATE_KEY must be set to upload files.");
  }

  return new ImageKit({ privateKey });
}

function getUrlEndpoint(): string {
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

  if (!urlEndpoint) {
    throw new Error("IMAGEKIT_URL_ENDPOINT must be set to build file URLs.");
  }

  return urlEndpoint;
}

// Verification documents are private — uploaded under isPrivateFile so they're
// only ever reachable via a short-lived signed URL, never a stable public one.
export async function uploadVendorDocument(
  vendorId: string,
  file: File,
  documentType: DocumentType,
): Promise<string> {
  const client = getClient();
  const extension = file.name.split(".").pop() ?? "bin";
  const fileName = `${documentType}-${Date.now()}.${extension}`;

  const response = await client.files.upload({
    file,
    fileName,
    folder: `/vendor-documents/${vendorId}`,
    isPrivateFile: true,
    useUniqueFileName: false,
  });

  if (!response.filePath) {
    throw new Error("ImageKit upload did not return a file path");
  }

  return response.filePath;
}

export async function getSignedDocumentUrl(
  filePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  const client = getClient();

  return client.helper.buildSrc({
    src: filePath,
    urlEndpoint: getUrlEndpoint(),
    signed: true,
    expiresIn: expiresInSeconds,
  });
}

// Gallery photos are public — the upload response's url is a stable CDN link
// usable directly in <img>, no signing needed.
export async function uploadVendorPhoto(
  vendorId: string,
  file: File,
): Promise<{ url: string; fileId: string }> {
  const client = getClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const response = await client.files.upload({
    file,
    fileName,
    folder: `/vendor-media/${vendorId}`,
    useUniqueFileName: false,
  });

  if (!response.url || !response.fileId) {
    throw new Error("ImageKit upload did not return a url/fileId");
  }

  return { url: response.url, fileId: response.fileId };
}

export async function deleteVendorPhoto(fileId: string): Promise<void> {
  const client = getClient();
  await client.files.delete(fileId);
}
