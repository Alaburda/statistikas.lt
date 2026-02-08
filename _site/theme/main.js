// ============================================
// Statistikas.lt - Main JavaScript
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  initNavbarScroll();
  initSmoothScroll();
  initFadeAnimations();
  initFormHandling();
  initCounterAnimation();
  initTypingEffect();
});

// ============================================
// Navbar scroll effect
// ============================================
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  let lastScroll = 0;
  const scrollThreshold = 100;

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    // Add background on scroll
    if (currentScroll > 50) {
      navbar.classList.add('navbar-scrolled');
    } else {
      navbar.classList.remove('navbar-scrolled');
    }

    // Hide/show on scroll direction (optional, disabled by default)
    // if (currentScroll > lastScroll && currentScroll > scrollThreshold) {
    //   navbar.style.transform = 'translateY(-100%)';
    // } else {
    //   navbar.style.transform = 'translateY(0)';
    // }
    
    lastScroll = currentScroll;
  });
}

// ============================================
// Smooth scroll for anchor links
// ============================================
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = document.querySelector('.navbar')?.offsetHeight || 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ============================================
// Fade-in animations on scroll
// ============================================
function initFadeAnimations() {
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in-visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe elements with fade-in class
  document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
  });

  // Auto-add fade-in to specific elements
  const autoFadeSelectors = [
    '.service-card',
    '.testimonial-card',
    '.process-step',
    '.faq-item',
    '.pricing-card'
  ];

  autoFadeSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((el, index) => {
      if (!el.classList.contains('fade-in')) {
        el.classList.add('fade-in');
        el.style.transitionDelay = `${index * 0.1}s`;
        observer.observe(el);
      }
    });
  });
}

// ============================================
// Form handling with feedback
// ============================================
function initFormHandling() {
  const forms = document.querySelectorAll('form[action*="formspree"]');
  
  forms.forEach(form => {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      
      // Show loading state
      submitBtn.innerHTML = '<span class="loading-spinner"></span> Siunčiama...';
      submitBtn.disabled = true;
      
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          // Success
          showFormMessage(form, 'success', 'Ačiū! Jūsų žinutė išsiųsta. Susisieksiu su jumis artimiausiu metu.');
          form.reset();
        } else {
          throw new Error('Form submission failed');
        }
      } catch (error) {
        showFormMessage(form, 'error', 'Atsiprašome, įvyko klaida. Bandykite dar kartą arba susisiekite el. paštu.');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  });
}

function showFormMessage(form, type, message) {
  // Remove existing messages
  form.querySelectorAll('.form-message').forEach(el => el.remove());
  
  const messageEl = document.createElement('div');
  messageEl.className = `form-message form-message-${type}`;
  messageEl.innerHTML = `
    <span class="message-icon">${type === 'success' ? '✓' : '✕'}</span>
    <span class="message-text">${message}</span>
  `;
  
  form.appendChild(messageEl);
  
  // Auto-remove success message after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      messageEl.classList.add('fade-out');
      setTimeout(() => messageEl.remove(), 300);
    }, 5000);
  }
}

// ============================================
// Counter animation for stats
// ============================================
function initCounterAnimation() {
  const counters = document.querySelectorAll('.stat-number');
  if (counters.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element) {
  const target = parseInt(element.getAttribute('data-target') || element.textContent);
  const duration = 2000;
  const step = target / (duration / 16);
  let current = 0;

  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      element.textContent = target + (element.getAttribute('data-suffix') || '');
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current) + (element.getAttribute('data-suffix') || '');
    }
  }, 16);
}

// ============================================
// Typing effect for hero
// ============================================
function initTypingEffect() {
  const typingElement = document.querySelector('.typing-text');
  if (!typingElement) return;

  const words = ['statistiką', 'duomenis', 'analizę', 'rezultatus'];
  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typeSpeed = 100;

  function type() {
    const currentWord = words[wordIndex];
    
    if (isDeleting) {
      typingElement.textContent = currentWord.substring(0, charIndex - 1);
      charIndex--;
      typeSpeed = 50;
    } else {
      typingElement.textContent = currentWord.substring(0, charIndex + 1);
      charIndex++;
      typeSpeed = 100;
    }

    if (!isDeleting && charIndex === currentWord.length) {
      typeSpeed = 2000; // Pause at end
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      typeSpeed = 500;
    }

    setTimeout(type, typeSpeed);
  }

  type();
}

// ============================================
// FAQ accordion
// ============================================
document.addEventListener('click', function(e) {
  if (e.target.closest('.faq-question')) {
    const faqItem = e.target.closest('.faq-item');
    const isOpen = faqItem.classList.contains('open');
    
    // Close all other items
    document.querySelectorAll('.faq-item.open').forEach(item => {
      if (item !== faqItem) {
        item.classList.remove('open');
      }
    });
    
    // Toggle current item
    faqItem.classList.toggle('open', !isOpen);
  }
});

// ============================================
// Mobile menu toggle
// ============================================
document.addEventListener('click', function(e) {
  const menuToggle = e.target.closest('.navbar-toggler');
  if (menuToggle) {
    document.body.classList.toggle('mobile-menu-open');
  }
});

// ============================================
// Utility: Add loading spinner styles dynamically
// ============================================
const spinnerStyles = document.createElement('style');
spinnerStyles.textContent = `
  .loading-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .fade-in {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  
  .fade-in-visible {
    opacity: 1;
    transform: translateY(0);
  }
  
  .fade-out {
    opacity: 0;
    transition: opacity 0.3s ease;
  }
`;
document.head.appendChild(spinnerStyles);

console.log('Statistikas.lt scripts loaded ✓');
