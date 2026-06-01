const menuToggle = document.querySelector('.menu-toggle')
const mainNav = document.querySelector('.main-nav')

menuToggle?.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open')
  menuToggle.setAttribute('aria-expanded', String(isOpen))
})

mainNav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open')
    menuToggle?.setAttribute('aria-expanded', 'false')
  })
})

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible')
      revealObserver.unobserve(entry.target)
    }
  })
}, { threshold: 0.12 })

document.querySelectorAll('.reveal').forEach(element => revealObserver.observe(element))

const filterButtons = document.querySelectorAll('.module-filters button')
const moduleCards = document.querySelectorAll('.module-card')

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filterButtons.forEach(item => item.classList.remove('active'))
    button.classList.add('active')
    const filter = button.dataset.filter
    moduleCards.forEach(card => card.classList.toggle('hidden', filter !== 'all' && card.dataset.category !== filter))
  })
})

document.querySelectorAll('.faq-list details').forEach(detail => {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return
    document.querySelectorAll('.faq-list details').forEach(other => {
      if (other !== detail) other.removeAttribute('open')
    })
  })
})

const releaseApiUrl = 'https://api.github.com/repos/XsharklinX/Vendix/releases/latest'
const releaseFallbackUrl = 'https://github.com/XsharklinX/Vendix/releases/latest'

fetch(releaseApiUrl, { headers: { Accept: 'application/vnd.github+json' } })
  .then(response => {
    if (!response.ok) throw new Error(`GitHub API respondio ${response.status}`)
    return response.json()
  })
  .then(release => {
    const installer = release.assets?.find(asset => /^Vendix-Setup-.*\.exe$/i.test(asset.name))
    const downloadUrl = installer?.browser_download_url || release.html_url || releaseFallbackUrl
    document.querySelectorAll('.download-link').forEach(link => {
      link.href = downloadUrl
    })
    document.querySelectorAll('[data-release-version]').forEach(element => {
      element.textContent = release.tag_name || 'Ultima version estable'
    })
    document.querySelectorAll('[data-release-file]').forEach(element => {
      element.textContent = installer
        ? `${installer.name} - ${formatBytes(installer.size)}`
        : 'Consulta el release mas reciente en GitHub'
    })
  })
  .catch(() => {
    document.querySelectorAll('[data-release-file]').forEach(element => {
      element.textContent = 'Descarga disponible desde GitHub Releases'
    })
  })

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
