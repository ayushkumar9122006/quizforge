// Wraps window.storage (Claude artifact storage) with localStorage fallback
async function storageGet(key, shared = false) {
  try {
    if (typeof window.storage !== 'undefined') {
      const r = await window.storage.get(key, shared)
      return r ? JSON.parse(r.value) : null
    }
  } catch {}
  // localStorage fallback (for Vite dev outside artifact)
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : null
  } catch { return null }
}

async function storageSet(key, val, shared = false) {
  try {
    if (typeof window.storage !== 'undefined') {
      await window.storage.set(key, JSON.stringify(val), shared)
      return
    }
  } catch {}
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

export { storageGet as sGet, storageSet as sSet }
