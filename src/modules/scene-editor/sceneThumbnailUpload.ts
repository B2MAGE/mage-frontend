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
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const presignResponse = await authenticatedFetch(presignPath, {
    signal,
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
  signal?.throwIfAborted();

  if (!presignedUpload.objectKey || !presignedUpload.uploadUrl || !presignedUpload.method) {
    throw new Error("Thumbnail upload response was incomplete.");
  }

  const uploadResponse = await fetch(presignedUpload.uploadUrl, {
    signal,
    method: presignedUpload.method,
    headers: presignedUpload.headers,
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload the thumbnail file to storage.");
  }

  signal?.throwIfAborted();
  return presignedUpload.objectKey;
}

export async function uploadNewSceneThumbnail(
  authenticatedFetch: AuthenticatedFetch,
  file: File,
  signal?: AbortSignal,
) {
  return uploadSceneThumbnail(authenticatedFetch, file, "/scenes/thumbnail/presign", signal);
}

export async function replaceSceneThumbnail(
  authenticatedFetch: AuthenticatedFetch,
  sceneId: number,
  file: File,
  signal?: AbortSignal,
) {
  const objectKey = await uploadSceneThumbnail(
    authenticatedFetch,
    file,
    `/scenes/${sceneId}/thumbnail/presign`,
    signal,
  );
  signal?.throwIfAborted();
  const finalizeResponse = await authenticatedFetch(`/scenes/${sceneId}/thumbnail/finalize`, {
    signal,
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
