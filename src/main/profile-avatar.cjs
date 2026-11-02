const MAX_PROFILE_AVATAR_BYTES = 2 * 1024 * 1024;

function hasExpectedSignature(type, bytes) {
  if (type === 'png') {
    return bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (type === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function normalizeProfileAvatar(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  const matched = source.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!matched) throw new Error('头像格式不支持，请选择 PNG、JPG 或 WebP 图片');
  const bytes = Buffer.from(matched[2], 'base64');
  if (!bytes.length || bytes.length > MAX_PROFILE_AVATAR_BYTES) {
    throw new Error('处理后的头像过大，请换一张图片');
  }
  if (!hasExpectedSignature(matched[1], bytes)) {
    throw new Error('头像文件内容与格式不匹配');
  }
  return source;
}

module.exports = { MAX_PROFILE_AVATAR_BYTES, normalizeProfileAvatar };
