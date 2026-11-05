// Identifies an image by its leading bytes ("magic numbers"), not by the client-supplied MIME type or filename.
const SIGNATURES = {
  jpeg: { contentType: "image/jpeg", extension: ".jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: {
    contentType: "image/png",
    extension: ".png",
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  webp: {
    contentType: "image/webp",
    extension: ".webp",
    test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
};

/** Returns { type, contentType, extension } for a recognised image, or null. */
const detectImage = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  for (const [type, signature] of Object.entries(SIGNATURES)) {
    if (signature.test(buffer)) {
      return { type, contentType: signature.contentType, extension: signature.extension };
    }
  }
  return null;
};

module.exports = { detectImage };
