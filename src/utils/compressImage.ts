export async function compressImage(uri: string, _maxSide?: number, _quality?: number): Promise<string> {
  return uri;
}

export async function imageBlob(uri: string, maxSide?: number): Promise<Blob> {
  const small = await compressImage(uri, maxSide);
  return (await fetch(small)).blob();
}
