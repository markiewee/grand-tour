// Hands a friend's browser a short-lived token so their voice note or video goes straight to Blob
// storage instead of through here. A Vercel function's body caps at 4.5 MB and a minute of video is
// far past that, so this is the only way a video ever arrives.
import { handleUpload } from '@vercel/blob/client';
import { json, route, mediaToken } from './_lib.js';

const KINDS = ['audio/*', 'video/*'];
const MAX_BYTES = 200 * 1024 * 1024;

export const POST = route(async (request) => {
  const body = await request.json();
  const result = await handleUpload({
    request,
    body,
    ...mediaToken(),
    onBeforeGenerateToken: async (pathname) => {
      // The token is only good for one file, under media/, of a kind a phone can actually play.
      if (!/^media\/[A-Za-z0-9_-]{1,40}\.[A-Za-z0-9]{1,8}$/.test(pathname)) {
        throw new Error('That file cannot go there.');
      }
      return {
        allowedContentTypes: KINDS,
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
        validUntil: Date.now() + 30 * 60 * 1000,
      };
    },
  });
  return json(result);
});
