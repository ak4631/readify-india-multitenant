// Leave room for multipart fields under Vercel's 4.5 MB request limit.
export const MAX_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;
export const UPLOAD_SIZE_MESSAGE =
  "File exceeds the 4 MB limit. Choose a smaller file.";

export function validateUploadFile(
  file: FormDataEntryValue | null,
  allowedTypes: readonly string[],
) {
  if (!(file instanceof File) || file.size === 0)
    return "Choose a file to upload.";
  if (file.size > MAX_UPLOAD_SIZE_BYTES) return UPLOAD_SIZE_MESSAGE;
  if (!allowedTypes.includes(file.type)) return "Choose a supported file type.";
  return null;
}
