/* =====================================================
   SAKURA V2 - GetBot JavaScript
   Creator: Andy Mrlit | Year: 2025
   ===================================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize particles animation
    function createParticles() {
        const particlesContainer = document.getElementById('particles');
        const particleCount = window.innerWidth < 768 ? 15 : 30;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.cssText = `
                position: absolute;
                width: ${Math.random() * 3 + 1}px;
                height: ${Math.random() * 3 + 1}px;
                background: ${Math.random() > 0.5 ? '#ff0040' : '#ff3366'};
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: particleFloat ${Math.random() * 15 + 10}s infinite ease-in-out;
                opacity: ${Math.random() * 0.6 + 0.4};
            `;
            particlesContainer.appendChild(particle);
        }
    }

    // Add particle animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes particleFloat {
            0%, 100% { 
                transform: translateY(0px) translateX(0px) rotate(0deg); 
            }
            25% { 
                transform: translateY(-${Math.random() * 80 + 40}px) translateX(${Math.random() * 80 + 40}px) rotate(90deg); 
            }
            50% { 
                transform: translateY(-${Math.random() * 120 + 80}px) translateX(-${Math.random() * 80 + 40}px) rotate(180deg); 
            }
            75% { 
                transform: translateY(-${Math.random() * 80 + 40}px) translateX(-${Math.random() * 120 + 80}px) rotate(270deg); 
            }
        }
    `;
    document.head.appendChild(style);

    createParticles();

    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Form handling
    const pairingForm = document.getElementById('pairingForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    const resultContainer = document.getElementById('resultContainer');
    const successResult = document.getElementById('successResult');
    const errorResult = document.getElementById('errorResult');
    const phoneNumberInput = document.getElementById('phoneNumber');

    // Phone number validation and formatting
    phoneNumberInput.addEventListener('input', function(e) {
        let value = e.target.value;
        
        // Remove + sign if present
        if (value.startsWith('+')) {
            value = value.substring(1);
        }
        
        // Remove any non-numeric characters except + at the beginning
        value = value.replace(/[^0-9]/g, '');
        
        // Limit to 16 digits (max international phone number length including country code)
        if (value.length > 16) {
            value = value.substring(0, 16);
        }
        
        e.target.value = value;
        validateForm();
    });

    // Form submission
    pairingForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const phoneNumber = phoneNumberInput.value.trim();
        
        if (!phoneNumber || phoneNumber.length < 8) {
            showError('Please enter a valid phone number with country code (minimum 8 digits)');
            return;
        }

        // Disable form and show loading
        setLoading(true);
        hideResults();

        try {
            console.log('Requesting pairing for:', phoneNumber);

            // Make request to pairing endpoint - phoneNumber already clean (no + sign)
            const response = await fetch('/pair', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phoneNumber: phoneNumber
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showSuccess(data.pairingCode);
            } else {
                showError(data.message || 'Failed to generate pairing code. Please try again.');
            }
        } catch (error) {
            console.error('Pairing error:', error);
            showError('Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        
        if (isLoading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'flex';
        } else {
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
        }
    }

    function hideResults() {
        resultContainer.style.display = 'none';
        successResult.style.display = 'none';
        errorResult.style.display = 'none';
    }

    function showSuccess(pairingCode) {
        const pairingCodeElement = document.getElementById('pairingCode');
        const codeTimer = document.getElementById('codeTimer');
        
        pairingCodeElement.textContent = pairingCode;
        
        resultContainer.style.display = 'block';
        successResult.style.display = 'block';
        errorResult.style.display = 'none';

        // Start countdown timer
        let timeLeft = 20;
        const timer = setInterval(() => {
            timeLeft--;
            codeTimer.textContent = `⏰ Expires in ${timeLeft} seconds`;
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                codeTimer.textContent = '⏰ Code expired';
                codeTimer.style.color = '#ff0064';
            }
        }, 1000);

        // Scroll to result
        setTimeout(() => {
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    function showError(message) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        
        resultContainer.style.display = 'block';
        errorResult.style.display = 'block';
        successResult.style.display = 'none';

        // Scroll to result
        setTimeout(() => {
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    // Add visual feedback for form interactions
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.classList.remove('focused');
        });
    });

    // Auto-focus on phone number input
    setTimeout(() => {
        phoneNumberInput.focus();
    }, 500);



    // Add ripple effect to buttons
    const buttons = document.querySelectorAll('.submit-btn, .try-again-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            `;
            
            button.style.position = 'relative';
            button.style.overflow = 'hidden';
            button.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });

    // Add animation for info cards
    const infoCards = document.querySelectorAll('.info-card, .step');
    
    const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 100);
            }
        });
    }, { threshold: 0.1 });

    infoCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        cardObserver.observe(card);
    });

    // Form validation feedback
    function validateForm() {
        const phoneNumber = phoneNumberInput.value.trim();
        
        const isValid = phoneNumber.length >= 8; // Minimum 8 digits with country code
        
        submitBtn.disabled = !isValid;
        submitBtn.style.opacity = isValid ? '1' : '0.6';
        
        return isValid;
    }

    // Real-time validation
    phoneNumberInput.addEventListener('input', validateForm);

    // Initial validation
    validateForm();

    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to submit form
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (!submitBtn.disabled) {
                pairingForm.dispatchEvent(new Event('submit'));
            }
        }
        
        // Escape to clear form
        if (e.key === 'Escape') {
            phoneNumberInput.value = '';
            hideResults();
            validateForm();
        }
    });

    // Enhanced copy to clipboard functionality for pairing code
    window.copyPairingCode = function() {
        const codeElement = document.getElementById('pairingCode');
        const code = codeElement.textContent.trim();
        
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(code).then(() => {
                showCopyFeedback(codeElement, 'Copied!');
            }).catch(() => {
                fallbackCopyTextToClipboard(code, codeElement);
            });
        } else {
            fallbackCopyTextToClipboard(code, codeElement);
        }
    };

    // Add copy to clipboard functionality for pairing code - Enhanced
    document.addEventListener('click', function(e) {
        if (e.target.closest('.pairing-code')) {
            copyPairingCode();
        }
    });

    // Enhanced copy feedback function
    function showCopyFeedback(element, message) {
        // Remove any existing feedback
        const existingFeedback = element.parentElement.querySelector('.copy-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        const feedback = document.createElement('div');
        feedback.className = 'copy-feedback';
        feedback.textContent = message;
        feedback.style.cssText = `
            position: absolute;
            top: -40px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--primary-red);
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            z-index: 1000;
            animation: copyFeedback 2.5s ease;
            box-shadow: 0 4px 12px rgba(255, 0, 64, 0.3);
            border: 1px solid var(--accent-red);
        `;
        
        element.parentElement.style.position = 'relative';
        element.parentElement.appendChild(feedback);
        
        // Add visual feedback to code element
        element.style.transform = 'scale(1.05)';
        element.style.background = 'var(--accent-red)';
        element.style.transition = 'all 0.2s ease';
        
        setTimeout(() => {
            element.style.transform = 'scale(1)';
            element.style.background = '';
        }, 200);
        
        setTimeout(() => {
            feedback.remove();
        }, 2500);
    }

    // Fallback copy function for older browsers
    function fallbackCopyTextToClipboard(text, element) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            showCopyFeedback(element, successful ? 'Copied!' : 'Copy failed');
        } catch (err) {
            showCopyFeedback(element, 'Copy failed');
        }
        
        document.body.removeChild(textArea);
    }

    // Add enhanced animations and copy feedback styles
    const copyStyle = document.createElement('style');
    copyStyle.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(10px); }
            20%, 80% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-10px); }
        }
        
        @keyframes copyFeedback {
            0% { 
                opacity: 0; 
                transform: translateX(-50%) translateY(10px) scale(0.8); 
            }
            15% { 
                opacity: 1; 
                transform: translateX(-50%) translateY(0) scale(1.05); 
            }
            25% { 
                transform: translateX(-50%) translateY(0) scale(1); 
            }
            85% { 
                opacity: 1; 
                transform: translateX(-50%) translateY(0) scale(1); 
            }
            100% { 
                opacity: 0; 
                transform: translateX(-50%) translateY(-15px) scale(0.9); 
            }
        }
        
        .pairing-code {
            cursor: pointer;
            user-select: all;
            position: relative;
        }
        
        .pairing-code:hover {
            background: var(--accent-red) !important;
            transform: scale(1.02) !important;
            box-shadow: 0 4px 20px rgba(255, 0, 64, 0.4) !important;
        }
        
        .pairing-code:active {
            transform: scale(0.98) !important;
        }
        
        /* Enhanced card animations */
        .feature-card, .info-card, .step {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .feature-card:hover, .info-card:hover, .step:hover {
            transform: translateY(-8px) scale(1.02);
            box-shadow: 0 20px 40px rgba(255, 0, 64, 0.15);
        }
    `;
    document.head.appendChild(copyStyle);

    // =====================================================
    // Comments System Functionality
    // =====================================================

    const commentForm = document.getElementById('commentForm');
    const userNameInput = document.getElementById('userName');
    const userCommentInput = document.getElementById('userComment');
    const charCount = document.getElementById('charCount');
    const commentSubmitBtn = document.getElementById('commentSubmitBtn');
    const commentsList = document.getElementById('commentsList');
    const commentsPagination = document.getElementById('commentsPagination');
    const commentsEmpty = document.getElementById('commentsEmpty');
    const commentsLoading = document.getElementById('commentsLoading');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const paginationInfo = document.getElementById('paginationInfo');

    let currentPage = 1;
    let totalPages = 1;

    // Character counter for comment textarea
    if (userCommentInput && charCount) {
        userCommentInput.addEventListener('input', function() {
            const length = this.value.length;
            charCount.textContent = length;
            
            const counter = charCount.parentElement;
            counter.classList.remove('warning', 'danger');
            
            if (length > 400) {
                counter.classList.add('danger');
            } else if (length > 300) {
                counter.classList.add('warning');
            }
        });
    }

    // Comment form submission
    if (commentForm) {
        commentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const name = userNameInput.value.trim();
            const comment = userCommentInput.value.trim();
            
            if (!name || !comment) {
                showCommentError('Please fill in all fields');
                return;
            }
            
            if (name.length < 2 || name.length > 50) {
                showCommentError('Name must be between 2 and 50 characters');
                return;
            }
            
            if (comment.length < 10 || comment.length > 500) {
                showCommentError('Comment must be between 10 and 500 characters');
                return;
            }
            
            setCommentLoading(true);
            
            try {
                const response = await fetch('/api/comments', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: name,
                        comment: comment
                    })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    // Clear form
                    userNameInput.value = '';
                    userCommentInput.value = '';
                    charCount.textContent = '0';
                    charCount.parentElement.classList.remove('warning', 'danger');
                    
                    showCommentSuccess('Comment posted successfully!');
                    
                    // Reload comments to show the new one
                    setTimeout(() => {
                        currentPage = 1; // Go to first page to see new comment
                        loadComments();
                    }, 1000);
                } else {
                    showCommentError(data.message || 'Failed to post comment');
                }
            } catch (error) {
                console.error('Comment submission error:', error);
                showCommentError('Network error. Please try again.');
            } finally {
                setCommentLoading(false);
            }
        });
    }

    // Load comments
    async function loadComments(page = 1) {
        try {
            showCommentsLoading(true);
            
            const response = await fetch(`/api/comments?page=${page}&limit=5`);
            const data = await response.json();
            
            if (response.ok && data.success) {
                displayComments(data.comments);
                updatePagination(data);
                currentPage = data.currentPage;
                totalPages = data.totalPages;
            } else {
                showCommentsError('Failed to load comments');
            }
        } catch (error) {
            console.error('Error loading comments:', error);
            showCommentsError('Failed to load comments');
        } finally {
            showCommentsLoading(false);
        }
    }

    // Display comments
    function displayComments(comments) {
        if (!commentsList) return;
        
        if (comments.length === 0) {
            commentsList.innerHTML = '';
            commentsEmpty.style.display = 'block';
            commentsPagination.style.display = 'none';
            return;
        }
        
        commentsEmpty.style.display = 'none';
        commentsPagination.style.display = 'flex';
        
        commentsList.innerHTML = comments.map((comment, index) => `
            <div class="comment-item" style="animation-delay: ${index * 0.1}s">
                <div class="comment-header">
                    <div class="comment-author">${escapeHtml(comment.name)}</div>
                    <div class="comment-date">${formatDate(comment.createdAt)}</div>
                </div>
                <p class="comment-text">${escapeHtml(comment.comment)}</p>
            </div>
        `).join('');
    }

    // Update pagination
    function updatePagination(data) {
        if (!commentsPagination) return;
        
        prevBtn.disabled = !data.hasPrevPage;
        nextBtn.disabled = !data.hasNextPage;
        paginationInfo.textContent = `Page ${data.currentPage} of ${data.totalPages}`;
        
        if (data.totalPages <= 1) {
            commentsPagination.style.display = 'none';
        } else {
            commentsPagination.style.display = 'flex';
        }
    }

    // Pagination event listeners
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                loadComments(currentPage - 1);
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                loadComments(currentPage + 1);
            }
        });
    }

    // Utility functions
    function setCommentLoading(isLoading) {
        if (!commentSubmitBtn) return;
        
        commentSubmitBtn.disabled = isLoading;
        const btnText = commentSubmitBtn.querySelector('.btn-text');
        const btnLoader = commentSubmitBtn.querySelector('.btn-loader');
        
        if (isLoading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'flex';
        } else {
            btnText.style.display = 'flex';
            btnLoader.style.display = 'none';
        }
    }

    function showCommentsLoading(isLoading) {
        if (!commentsLoading) return;
        commentsLoading.style.display = isLoading ? 'block' : 'none';
    }

    function showCommentSuccess(message) {
        showCommentNotification(message, 'success');
    }

    function showCommentError(message) {
        showCommentNotification(message, 'error');
    }

    function showCommentsError(message) {
        if (commentsList) {
            commentsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--primary-red);">
                    <p>${message}</p>
                </div>
            `;
        }
    }

    function showCommentNotification(message, type) {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.comment-notification');
        existingNotifications.forEach(notification => notification.remove());
        
        const notification = document.createElement('div');
        notification.className = `comment-notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#22c55e' : '#ef4444'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 10000;
            animation: slideInRight 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            return 'Today';
        } else if (diffDays === 2) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays - 1} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Add notification animations
    const notificationStyle = document.createElement('style');
    notificationStyle.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(notificationStyle);

    // Initialize comments on page load
    setTimeout(() => {
        loadComments();
    }, 1000);

    console.log('🌸 SAKURA V2 GetBot page loaded successfully!');
});