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
