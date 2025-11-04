/* =====================================================
   SAKURA V2 - Optimized Main JavaScript
   Creator: Andy Mrlit | Year: 2025
   Performance Optimized Version
   ===================================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Performance optimization: Use requestAnimationFrame for smooth animations
    let ticking = false;
    
    // Navbar scroll effect (optimized)
    const navbar = document.getElementById('navbar');
    
    function updateNavbar() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        ticking = false;
    }
    
    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(updateNavbar);
            ticking = true;
        }
    }, { passive: true });

    // Mobile menu toggle
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
    }

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                // Close mobile menu if open
                if (navMenu) {
                    navMenu.classList.remove('active');
                }
                if (hamburger) {
                    hamburger.classList.remove('active');
                }
            }
        });
    });

    // FAQ Accordion (improved accessibility)
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        
        if (question) {
            // Add ARIA attributes for accessibility
            question.setAttribute('role', 'button');
            question.setAttribute('tabindex', '0');
            question.setAttribute('aria-expanded', 'false');
            
            question.addEventListener('click', function() {
                toggleFAQ(item, question);
            });
            
            // Keyboard support
            question.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleFAQ(item, question);
                }
            });
        }
    });
    
    function toggleFAQ(item, question) {
        const isActive = item.classList.contains('active');
        
        // Close other open items
        faqItems.forEach(otherItem => {
            if (otherItem !== item) {
                otherItem.classList.remove('active');
                const otherQuestion = otherItem.querySelector('.faq-question');
                if (otherQuestion) {
                    otherQuestion.setAttribute('aria-expanded', 'false');
                }
            }
        });
        
        // Toggle current item
        item.classList.toggle('active');
        question.setAttribute('aria-expanded', !isActive);
    }

    // Intersection Observer for animations (optimized)
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                // Unobserve after animation to improve performance
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Apply fade-in animation to elements (reduced set for performance)
    const animatedElements = document.querySelectorAll('.feature-card, .faq-item');
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Simplified particle generation (performance optimized)
    function createParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;
        
        // Reduce particles on mobile for better performance
        const particleCount = window.innerWidth < 768 ? 10 : 20;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.cssText = `
                position: absolute;
                width: 2px;
                height: 2px;
                background: #ff0040;
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: particleFloat ${Math.random() * 10 + 15}s infinite ease-in-out;
                opacity: ${Math.random() * 0.5 + 0.3};
                will-change: transform;
            `;
            particlesContainer.appendChild(particle);
        }
    }

    // Add optimized particle animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes particleFloat {
            0%, 100% { 
                transform: translateY(0px) translateX(0px); 
            }
            50% { 
                transform: translateY(-30px) translateX(20px); 
            }
        }
    `;
    document.head.appendChild(style);

    // Create particles only if not on mobile for performance
    if (window.innerWidth > 768) {
        createParticles();
    }

    // Optimized button click effects (simplified)
    const buttons = document.querySelectorAll('.cta-button');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Simple scale effect instead of ripple for better performance
            button.style.transform = 'scale(0.95)';
            setTimeout(() => {
                button.style.transform = 'scale(1)';
            }, 150);
        });
    });

    // Performance optimization: Reduced scroll events
    let lastScrollTime = 0;
    const scrollThrottle = 16; // ~60fps

    function handleScroll() {
        const now = Date.now();
        if (now - lastScrollTime >= scrollThrottle) {
            lastScrollTime = now;
            // Add any scroll-based effects here if needed
        }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Lazy loading support (simplified)
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.classList.remove('lazy');
                        imageObserver.unobserve(img);
                    }
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }

    // Loading state management
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
    });

    // Keyboard navigation support for accessibility
    document.addEventListener('keydown', function(e) {
        // Enable keyboard navigation for interactive elements
        if (e.target.classList.contains('faq-question') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.target.click();
        }
        
        // Close mobile menu with Escape key
        if (e.key === 'Escape' && navMenu && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            if (hamburger) {
                hamburger.classList.remove('active');
            }
        }
    });

    // Reduced motion support
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // Disable animations for users who prefer reduced motion
        const style = document.createElement('style');
        style.textContent = `
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Console message (optimized)
    console.log('🌸 SHADOW V2 - ADVANCED WHATSAPP BOT | CREATOR: DYBY TECH ');
});

// Service worker registration for better performance (if available)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('SW registered: ', registration);
        }).catch(function(registrationError) {
            console.log('SW registration failed: ', registrationError);
        });
    });
}