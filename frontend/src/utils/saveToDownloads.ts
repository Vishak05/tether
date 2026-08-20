import * as LegacyFileSystem from 'expo-file-system/legacy';
import type { File } from 'expo-file-system';

import { getDownloadsDirectoryUri, setDownloadsDirectoryUri } from '../auth/secureStore';

const { StorageAccessFramework } = LegacyFileSystem;

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  json: 'application/json',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return (ext && MIME_TYPES[ext]) || 'application/octet-stream';
}

async function pickDownloadsDirectory(): Promise<string | null> {
  const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perms.granted) return null;
  await setDownloadsDirectoryUri(perms.directoryUri);
  return perms.directoryUri;
}

/**
 * Copies a locally-downloaded file (e.g. in the app's cache dir, from
 * File.createDownloadTask) into a user-chosen folder via Android's Storage
 * Access Framework — so tapping "Get" actually saves the file somewhere
 * visible (Downloads, or wherever the user picks) instead of just opening
 * the OS share sheet. The chosen folder is asked for once and remembered;
 * if that stored permission is later revoked, it re-prompts once.
 *
 * Returns the SAF URI of the saved file.
 */
export async function saveFileToDownloads(localFile: File): Promise<string> {
  let directoryUri = await getDownloadsDirectoryUri();
  if (!directoryUri) {
    directoryUri = await pickDownloadsDirectory();
    if (!directoryUri) throw new Error('No folder selected — file was not saved.');
  }

  const base64 = await LegacyFileSystem.readAsStringAsync(localFile.uri, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });
  const mimeType = guessMimeType(localFile.name);

  let destUri: string;
  try {
    destUri = await StorageAccessFramework.createFileAsync(directoryUri, localFile.name, mimeType);
  } catch {
    // Stored permission may have been revoked since — ask again once.
    directoryUri = await pickDownloadsDirectory();
    if (!directoryUri) throw new Error('No folder selected — file was not saved.');
    destUri = await StorageAccessFramework.createFileAsync(directoryUri, localFile.name, mimeType);
  }

  await LegacyFileSystem.writeAsStringAsync(destUri, base64, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });

  return destUri;
}
