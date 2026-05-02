import { parseApiError } from "@shared/lib";

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

async function uploadSceneThumbnail(
  authenticatedFetch: AuthenticatedFetch,
  file: File,
  presignPath: string,
) {
  const presignResponse = await authenticatedFetch(presignPath, {
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

  if (!presignedUpload.objectKey || !presignedUpload.uploadUrl || !presignedUpload.method) {
    throw new Error("Thumbnail upload response was incomplete.");
  }

  const uploadResponse = await fetch(presignedUpload.uploadUrl, {
    method: presignedUpload.method,
    headers: presignedUpload.headers,
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload the thumbnail file to storage.");
  }

  return presignedUpload.objectKey;
}

export async function uploadNewSceneThumbnail(
  authenticatedFetch: AuthenticatedFetch,
  file: File,
) {
  return uploadSceneThumbnail(authenticatedFetch, file, "/scenes/thumbnail/presign");
}

export async function replaceSceneThumbnail(
  authenticatedFetch: AuthenticatedFetch,
  sceneId: number,
  file: File,
) {
  const objectKey = await uploadSceneThumbnail(
    authenticatedFetch,
    file,
    `/scenes/${sceneId}/thumbnail/presign`,
  );
  const finalizeResponse = await authenticatedFetch(`/scenes/${sceneId}/thumbnail/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey }),
  });

  if (!finalizeResponse.ok) {
    const apiError = await parseApiError(finalizeResponse);
    throw new Error(
      apiError?.message ?? "Failed to replace the scene thumbnail.",
    );
  }
}
