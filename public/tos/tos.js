const backToTop = document.getElementById('back-to-top');
window.addEventListener('scroll', () => {
  backToTop.classList.toggle('visible', window.scrollY > 400);
});

const sections = document.querySelectorAll('.legal-section');
const tocLinks = document.querySelectorAll('.toc-list a');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      tocLinks.forEach(link => link.classList.remove('active-section'));
      const id = entry.target.getAttribute('id');
      const activeLink = document.querySelector(`.toc-list a[href="#${id}"]`);
      if (activeLink) activeLink.classList.add('active-section');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });

sections.forEach(section => observer.observe(section));
