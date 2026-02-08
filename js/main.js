/**
 * Statistikas.lt - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initHeaderScroll();
    initSmoothScroll();
    initFadeInAnimations();
    initFormValidation();
});

/**
 * Mobile Menu Toggle
 */
function initMobileMenu() {
    const navToggle = document.getElementById('nav-toggle');
    const navClose = document.getElementById('nav-close');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav__link');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.add('show-menu');
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (navClose && navMenu) {
        navClose.addEventListener('click', () => {
            navMenu.classList.remove('show-menu');
            document.body.style.overflow = '';
        });
    }
    
    // Close menu when clicking on nav links
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('show-menu');
            document.body.style.overflow = '';
        });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (navMenu && navMenu.classList.contains('show-menu')) {
            if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
                navMenu.classList.remove('show-menu');
                document.body.style.overflow = '';
            }
        }
    });
}

/**
 * Header scroll effect
 */
function initHeaderScroll() {
    const header = document.getElementById('header');
    let lastScrollY = window.scrollY;
    
    if (!header) return;
    
    const handleScroll = () => {
        const currentScrollY = window.scrollY;
        
        // Add shadow when scrolled
        if (currentScrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        lastScrollY = currentScrollY;
    };
    
    // Throttle scroll event
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                handleScroll();
                ticking = false;
            });
            ticking = true;
        }
    });
}

/**
 * Smooth scroll to anchor links
 */
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const headerHeight = document.getElementById('header')?.offsetHeight || 0;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Fade in animations on scroll
 */
function initFadeInAnimations() {
    const fadeElements = document.querySelectorAll(
        '.service-card, .testimonial-card, .process__step, .about__content, .about__image-container'
    );
    
    if (!fadeElements.length) return;
    
    // Add fade-in class
    fadeElements.forEach(el => {
        el.classList.add('fade-in');
    });
    
    // Check if IntersectionObserver is supported
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            root: null,
            rootMargin: '0px 0px -50px 0px',
            threshold: 0.1
        });
        
        fadeElements.forEach(el => observer.observe(el));
    } else {
        // Fallback for older browsers
        fadeElements.forEach(el => el.classList.add('visible'));
    }
}

/**
 * Form validation and submission
 */
function initFormValidation() {
    const form = document.querySelector('.contact__form');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        // Validate form
        const inputs = form.querySelectorAll('input[required], textarea[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
            } else {
                input.classList.remove('error');
            }
        });
        
        // Email validation
        const emailInput = form.querySelector('input[type="email"]');
        if (emailInput && !isValidEmail(emailInput.value)) {
            isValid = false;
            emailInput.classList.add('error');
        }
        
        if (!isValid) {
            return;
        }
        
        // Show loading state
        submitBtn.innerHTML = `
            <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Siunčiama...
        `;
        submitBtn.disabled = true;
        
        try {
            // Get form data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // Check if Formspree is configured
            const formAction = form.getAttribute('action');
            if (formAction && formAction.includes('formspree.io') && !formAction.includes('your-form-id')) {
                const response = await fetch(formAction, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (response.ok) {
                    showSuccessMessage(form);
                    form.reset();
                } else {
                    throw new Error('Form submission failed');
                }
            } else {
                // Demo mode - just show success after delay
                await new Promise(resolve => setTimeout(resolve, 1500));
                showSuccessMessage(form);
                form.reset();
            }
        } catch (error) {
            console.error('Form submission error:', error);
            showErrorMessage(form);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
    
    // Remove error class on input
    form.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('error');
        });
    });
}

/**
 * Email validation helper
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Show success message
 */
function showSuccessMessage(form) {
    const message = document.createElement('div');
    message.className = 'form-message form-message--success';
    message.innerHTML = `
        <div class="form-message__icon">✅</div>
        <div class="form-message__content">
            <strong>Ačiū už žinutę!</strong>
            <p>Atsakysiu per 24 valandas.</p>
        </div>
    `;
    
    form.insertBefore(message, form.firstChild);
    
    // Add styles dynamically
    addMessageStyles();
    
    // Remove message after 5 seconds
    setTimeout(() => {
        message.remove();
    }, 5000);
}

/**
 * Show error message
 */
function showErrorMessage(form) {
    const message = document.createElement('div');
    message.className = 'form-message form-message--error';
    message.innerHTML = `
        <div class="form-message__icon">❌</div>
        <div class="form-message__content">
            <strong>Klaida!</strong>
            <p>Bandykite dar kartą arba rašykite tiesiogiai į info@statistikas.lt</p>
        </div>
    `;
    
    form.insertBefore(message, form.firstChild);
    
    // Add styles dynamically
    addMessageStyles();
    
    // Remove message after 5 seconds
    setTimeout(() => {
        message.remove();
    }, 5000);
}

/**
 * Add message styles if not already added
 */
function addMessageStyles() {
    if (document.getElementById('form-message-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'form-message-styles';
    styles.textContent = `
        .form-message {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            padding: 1rem;
            border-radius: 0.75rem;
            margin-bottom: 1.5rem;
            animation: slideDown 0.3s ease;
        }
        
        .form-message--success {
            background: #dcfce7;
            border: 1px solid #22c55e;
        }
        
        .form-message--error {
            background: #fee2e2;
            border: 1px solid #ef4444;
        }
        
        .form-message__icon {
            font-size: 1.25rem;
        }
        
        .form-message__content strong {
            display: block;
            margin-bottom: 0.25rem;
        }
        
        .form-message__content p {
            font-size: 0.875rem;
            color: #374151;
        }
        
        .form__input.error {
            border-color: #ef4444;
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        }
        
        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .spinner {
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    
    document.head.appendChild(styles);
}

/**
 * Analytics tracking (placeholder)
 */
function trackEvent(category, action, label) {
    // Placeholder for Google Analytics or other tracking
    if (typeof gtag !== 'undefined') {
        gtag('event', action, {
            event_category: category,
            event_label: label
        });
    }
}
