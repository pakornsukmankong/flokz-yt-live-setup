// YouTube รับภาพปกไม่เกิน 2MB และแนะนำขนาด 1280x720
const MAX_BYTES = 2 * 1024 * 1024
const MAX_WIDTH = 1280
const MAX_HEIGHT = 720

// ภาพที่เกิน 2MB จะถูกย่อและแปลงเป็น JPG ในเบราว์เซอร์ก่อนอัปโหลด
export async function fitThumbnail(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file

  const img = await createImageBitmap(file).catch(() => null)
  if (!img) throw new Error('เปิดไฟล์ภาพนี้ไม่ได้')
  const scale = Math.min(1, MAX_WIDTH / img.width, MAX_HEIGHT / img.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()

  for (const quality of [0.92, 0.8, 0.65]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_BYTES) {
      return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' })
    }
  }
  throw new Error('ย่อภาพปกให้ต่ำกว่า 2MB ไม่สำเร็จ')
}
