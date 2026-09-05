export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function formatTime(s) {
  return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  if (mins === 0) {
    return `${secs} sec`
  }
  return `${mins} min ${secs.toString().padStart(2, '0')} sec`
}

export function cropImage(imgDataUrl, cropPct) {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => {
      const {x,y,w,h} = cropPct
      const sx=(x/100)*img.width, sy=(y/100)*img.height
      const sw=(w/100)*img.width, sh=(h/100)*img.height
      const c = document.createElement('canvas')
      c.width=sw; c.height=sh
      c.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,sw,sh)
      res(c.toDataURL('image/jpeg', 0.93))
    }
    img.src = imgDataUrl
  })
}
