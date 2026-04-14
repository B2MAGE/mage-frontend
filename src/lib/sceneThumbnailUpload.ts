import { parseApiError } from "./authForm";

type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type PresignedThumbnailUploadResponse = {
  objectKey: string;
  uploadUrl: string;
  method: string;
  headers?: Record<string, string>;
};

export async function uploadNewSceneThumbnail(
  authenticatedFetch: AuthenticatedFetch,
  file: File,
) {
  const presignResponse = await authenticatedFetch("/scenes/thumbnail/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
  });

  if (!presignResponse.ok) {
    const apiError = await parseApiError(presignResponse);
    throw new Error(
      apiError?.message ?? "Failed to prepare the thumbnail upload.",
    );
  }

  const presignedUpload =
    (await presignResponse.json()) as PresignedThumbnailUploadResponse;
  const uploadResponse = await fetch(presignedUpload.uploadUrl, {
    method: presignedUpload.method || "PUT",
    headers: presignedUpload.headers,
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload the thumbnail file to storage.");
  }

  return presignedUpload.objectKey;
}
