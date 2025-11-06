/**
 * Student Dashboard JavaScript - WITH ADVANCED NOTIFICATIONS
 * Includes: Class reminders (1hr, 30min, 15min, 10min) + Exam countdowns
 */

// --- NOTIFICATION SYSTEM (COMPLETE) ---

let notificationPermission = 'default';
let notificationCheckInterval = null;

// Request notification permission
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        notificationPermission = await Notification.requestPermission();
        console.log('✅ Notification permission:', notificationPermission);
        
        if (notificationPermission === 'granted') {
            showBrowserNotification('UniPortal Ready!', 'Notifications are now enabled. You\'ll be alerted about classes and exams.');
        }
    } else if ('Notification' in window) {
        notificationPermission = Notification.permission;
        console.log('✅ Notification permission:', notificationPermission);
    }
}

// Show browser notification
function showBrowserNotification(title, body) {
    if (!('Notification' in window)) {
        console.warn('Browser does not support notifications');
        return;
    }

    if (Notification.permission === 'granted') {
        // --- START MODIFIED LOGIC ---
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            // 1. Send notification data to the active Service Worker
            navigator.serviceWorker.controller.postMessage({
                action: 'notify',
                title: title,
                body: body,
                icon: './icon-192.png'
            });
            console.log('✅ Notification sent to Service Worker:', title);
        } else {
            // 2. Fallback if Service Worker is not active (i.e., page is open)
            try {
                const notification = new Notification(title, {
                    body: body,
                    icon: './icon-192.png',
                    badge: './icon-192.png',
                    vibrate: [200, 100, 200],
                    tag: 'uniportal-' + Date.now(),
                    requireInteraction: false // Set this to false for non-persistent
                });

                notification.onclick = function() {
                    window.focus();
                    notification.close();
                };

                console.log('✅ Standard Notification shown:', title);
            } catch (error) {
                console.error('❌ Standard Notification error:', error);
            }
        }
        // --- END MODIFIED LOGIC ---
    } else {
        console.warn('⚠️ Notification permission not granted');
    }
}

// Add notification to in-app list
function addNotification(message, time = 'Just now') {
    if (!state.notifications) {
        state.notifications = [];
    }
    
    state.notifications.unshift({ message, time });
    
    // Keep only last 10 notifications
    if (state.notifications.length > 10) {
        state.notifications = state.notifications.slice(0, 10);
    }
    
    saveState();
    renderNotifications();
}

// Combined notification (both browser + in-app)
function sendNotification(title, message) {
    console.log('📢 Sending notification:', title, message);
    
    // Browser/PWA notification (now uses SW if available)
    showBrowserNotification(title, message); 
    
    // In-app notification
    addNotification(message);
}


// Parse time string to minutes from midnight
function parseTimeToMinutes(timeString) {
    const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const meridiem = match[3].toUpperCase();
    
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
}

// Check for upcoming class notifications (1hr, 30min, 15min, 10min before)
function checkUpcomingClassNotifications() {
    console.log('🔍 Checking upcoming class notifications...');
    
    const now = new Date();
    const today = now.toLocaleString('en-us', { weekday: 'long' });
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const todayClasses = state.timetable[today] || [];
    
    if (todayClasses.length === 0) {
        console.log('No classes today');
        return;
    }
    
    console.log(`Found ${todayClasses.length} classes today`);
    
    // Check each class for upcoming notifications
    todayClasses.forEach(classItem => {
        const classTimeMinutes = parseTimeToMinutes(classItem.time);
        
        if (!classTimeMinutes) {
            console.warn('Could not parse time:', classItem.time);
            return;
        }
        
        const minutesUntilClass = classTimeMinutes - currentMinutes;
        
        console.log(`${classItem.code}: ${minutesUntilClass} minutes until class`);
        
        // Define notification checkpoints (in minutes)
        const checkpoints = [
            { minutes: 60, label: '1 hour', emoji: '⏰' },
            { minutes: 30, label: '30 minutes', emoji: '⏰' },
            { minutes: 15, label: '15 minutes', emoji: '⚠️' },
            { minutes: 10, label: '10 minutes', emoji: '🔔' }
        ];
        
        checkpoints.forEach(checkpoint => {
            // Check if we're within 2 minutes of the checkpoint (to avoid missing it)
            if (minutesUntilClass >= checkpoint.minutes - 2 && minutesUntilClass <= checkpoint.minutes + 2) {
                const notificationKey = `class_${classItem.code}_${today}_${checkpoint.minutes}min`;
                const alreadyNotified = sessionStorage.getItem(notificationKey);
                
                if (!alreadyNotified) {
                    sendNotification(
                        `${checkpoint.emoji} Class Starting Soon!`,
                        `${classItem.code} (${classItem.subject}) starts in ${checkpoint.label} at ${classItem.time}`
                    );
                    
                    sessionStorage.setItem(notificationKey, 'true');
                    console.log(`✅ Sent ${checkpoint.label} reminder for ${classItem.code}`);
                }
            }
        });
        
        // Also notify when class starts (0-2 minutes)
        if (minutesUntilClass >= -2 && minutesUntilClass <= 2) {
            const notificationKey = `class_${classItem.code}_${today}_now`;
            const alreadyNotified = sessionStorage.getItem(notificationKey);
            
            if (!alreadyNotified) {
                sendNotification(
                    '🎓 Class Starting NOW!',
                    `${classItem.code} (${classItem.subject}) is starting now at ${classItem.time}`
                );
                
                sessionStorage.setItem(notificationKey, 'true');
                console.log(`✅ Sent "starting now" reminder for ${classItem.code}`);
            }
        }
    });
}

// Check for daily class summary (at 7 AM)
function checkDailyClassSummary() {
    console.log('🔍 Checking daily class summary...');
    
    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toLocaleString('en-us', { weekday: 'long' });
    const todayClasses = state.timetable[today] || [];
    
    if (todayClasses.length === 0) return;
    
    // Send summary at 7 AM if not already sent today
    if (currentHour === 7) {
        const lastSummaryDate = localStorage.getItem('lastDailySummary');
        const todayDate = now.toDateString();
        
        if (lastSummaryDate !== todayDate) {
            const classCount = todayClasses.length;
            const classList = todayClasses.map(c => `${c.code} at ${c.time}`).join(', ');
            
            sendNotification(
                '📚 Today\'s Classes',
                `You have ${classCount} class${classCount > 1 ? 'es' : ''} today: ${classList}`
            );
            
            localStorage.setItem('lastDailySummary', todayDate);
            console.log('✅ Daily class summary sent');
        }
    }
}

// Check for exam notifications (40, 20, 10, 5, 2, 1 days and exam day)
function checkExamNotifications() {
    console.log('🔍 Checking exam notifications...');
    
    if (!state.exams || state.exams.length === 0) {
        console.log('No exams scheduled');
        return;
    }
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    state.exams.forEach(exam => {
        const examDate = new Date(exam.date + "T00:00:00");
        const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
        
        console.log(`Exam "${exam.name}" is in ${daysUntil} days`);
        
        const checkpoints = [40, 20, 10, 5, 2, 1, 0];
        
        if (checkpoints.includes(daysUntil)) {
            const notificationKey = `exam_${exam.id}_day_${daysUntil}`;
            const alreadyNotified = localStorage.getItem(notificationKey);
            
            if (alreadyNotified) {
                console.log(`Already notified for ${exam.name} at ${daysUntil} days`);
                return;
            }
            
            let title = '';
            let message = '';
            
            if (daysUntil === 0) {
                title = '🎯 EXAM TODAY!';
                message = `${exam.name} exam is TODAY! Good luck! 🍀`;
            } else if (daysUntil === 1) {
                title = '⚠️ EXAM TOMORROW!';
                message = `${exam.name} exam is TOMORROW. Final review time!`;
            } else if (daysUntil === 2) {
                title = '⏰ 2 Days to Exam';
                message = `${exam.name} exam in 2 days. Prepare well!`;
            } else if (daysUntil === 5) {
                title = '📅 5 Days to Exam';
                message = `${exam.name} exam in 5 days. Start intensive revision!`;
            } else if (daysUntil === 10) {
                title = '📌 10 Days to Exam';
                message = `${exam.name} exam in 10 days. Plan your study schedule.`;
            } else if (daysUntil === 20) {
                title = '📆 20 Days to Exam';
                message = `${exam.name} exam in 20 days. Start early preparation.`;
            } else if (daysUntil === 40) {
                title = '📅 40 Days to Exam';
                message = `${exam.name} exam in 40 days. Mark your calendar!`;
            }
            
            sendNotification(title, message);
            localStorage.setItem(notificationKey, now.toDateString());
            console.log(`✅ Exam notification sent for ${exam.name} (${daysUntil} days)`);
        }
    });
}

// Run all notification checks
function runNotificationChecks() {
    console.log('🔄 Running notification checks...');
    checkUpcomingClassNotifications();
    checkDailyClassSummary();
    checkExamNotifications();
}

// Schedule notifications to check frequently
function scheduleNotificationChecks() {
    console.log('⏰ Scheduling notification checks...');
    
    // Clear any existing interval
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
    }
    
    // Run immediately on load
    setTimeout(() => {
        runNotificationChecks();
    }, 3000);
    
    // Check every 5 minutes for class reminders (more frequent)
    notificationCheckInterval = setInterval(runNotificationChecks, 5 * 60 * 1000);
    
    // Also check when page becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('👀 Page visible again, checking notifications...');
            runNotificationChecks();
        }
    });
    
    // Clear session storage at midnight for fresh daily notifications
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - now;
    
    setTimeout(() => {
        console.log('🌙 Midnight - clearing session storage for fresh notifications');
        sessionStorage.clear();
        scheduleNotificationChecks(); // Reschedule
    }, msUntilMidnight);
}

// Test notification function
function testNotification() {
    console.log('🧪 Testing notification...');
    sendNotification('Test Notification', 'If you see this, notifications are working! ✅');
}

// Test class reminder function
function testClassReminder() {
    console.log('🧪 Testing class reminder...');
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    sendNotification('⏰ Class Reminder Test', `This is a test class reminder. Current time: ${time}`);
}
// --- UTILITY FUNCTIONS ---

// Unified file creation for notes (used for both share and download)
function createNoteFile(note) {
    if (!note || !note.content) return null;
    
    // Strip HTML for plain text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = note.content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    
    const fileContent = 
        `UniPortal Note: ${note.title}\n` +
        `Date: ${note.date || new Date().toLocaleDateString()}\n` +
        `----------------------------------------\n\n` +
        plainText;

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const fileName = `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}_UniPortal.txt`;
    
    return new File([blob], fileName, { type: 'text/plain' });
}

// Unified download trigger function
function executeDownload(file) {
    if (!file) {
        console.error("Download failed: No file object provided.");

        alert("Failed to create download file.");
        return;
    }
    
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`Successfully downloaded: ${file.name}`);
}

// --- SHARE FUNCTIONALITY ---

async function executeShare(note) {
    const singleNoteFile = createNoteFile(note); 
    
    if (!singleNoteFile) {
        alert("Failed to create file for sharing.");
        return;
    }
    
    // Create a better preview of the note content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = note.content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    const preview = plainText.length > 150 
        ? plainText.substring(0, 150).trim() + '...' 
        : plainText;
    
    const shareData = {
        title: `📝 ${note.title}`,
        text: `UniPortal Note: ${note.title}\n\n${preview}\n\n📅 ${note.date}\n\nShared from UniPortal Student Dashboard`,
        files: [singleNoteFile],
    };
    
    // Try file sharing first
    if (navigator.canShare && navigator.canShare(shareData)) {
        try {
            closeModal('shareNotesModal');
            await navigator.share(shareData);
            console.log(`Successfully shared note: ${note.id}`);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error sharing file:', error);
                alert("Failed to open share dialog.");
            }
        }
    } else {
        // Fallback: text-only share without file
        closeModal('shareNotesModal');
        
        try {
            const textOnlyShare = {
                title: `📝 ${note.title}`,
                text: `UniPortal Note: ${note.title}\n\n${plainText}\n\n📅 ${note.date}\n\nShared from UniPortal`,
            };
            
            await navigator.share(textOnlyShare);
            console.log('Shared text-only version');
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Share failed:", err);
                // Final fallback: copy to clipboard
                try {
                    await navigator.clipboard.writeText(
                        `${note.title}\n\n${plainText}\n\n${note.date}`
                    );
                    alert("✅ Note copied to clipboard! You can now paste it anywhere.");
                } catch (clipErr) {
                    alert("Sharing not supported on this device. Use the download feature instead.");
                }
            }
        }
    }
}

function populateNoteList() {
    const noteListContainer = document.getElementById('noteListContainer'); 
    
    if (!noteListContainer) {
        console.warn("Error: Note list container not found.");
        return; 
    }

    noteListContainer.innerHTML = '';
    const notesToDisplay = state.notes; 

    if (notesToDisplay.length === 0) {
        noteListContainer.innerHTML = '<li class="no-data">No notes available to share.</li>';
        return;
    }


    notesToDisplay.forEach(note => {
        const listItem = document.createElement('li');
        listItem.textContent = note.title; 
        listItem.setAttribute('data-note-id', String(note.id)); 
        
        listItem.addEventListener('click', async (e) => { 
            const selectedId = e.currentTarget.getAttribute('data-note-id');
            const selectedNote = notesToDisplay.find(n => String(n.id) === selectedId); 
            
            if (selectedNote) {
                await executeShare(selectedNote);
            }
        });
        

        noteListContainer.appendChild(listItem);
    });
}

// --- DOWNLOAD FUNCTIONALITY ---

function populateDownloadList() {
    const downloadListContainer = document.getElementById('downloadListContainer');
    
    if (!downloadListContainer) {
        console.warn("Error: Download list container not found.");
        return; 
    }

    downloadListContainer.innerHTML = '';
    const notesToDisplay = state.notes; 

    if (notesToDisplay.length === 0) {

        downloadListContainer.innerHTML = '<li class="no-data">No notes available to download.</li>';
        return;
    }

    notesToDisplay.forEach(note => {
        const listItem = document.createElement('li');
        listItem.className = 'download-list-item';
        listItem.textContent = note.title;
        listItem.setAttribute('data-note-id', String(note.id)); 
        
        listItem.addEventListener('click', (e) => {
            const selectedId = e.currentTarget.getAttribute('data-note-id'); 
            const selectedNote = state.notes.find(n => String(n.id) === selectedId);

            if (selectedNote) {
                const file = createNoteFile(selectedNote);
                executeDownload(file);
                closeModal('downloadNotesModal'); 
            }
        });
        
        downloadListContainer.appendChild(listItem);
    });
}

function handleEditorDownload() {
    if (!quill || quill.getText().trim() === '') {
        alert("Cannot download an empty note. Please add content first.");
        return;
    }

    const noteTitleInput = document.getElementById('note-title-input');
    const title = noteTitleInput.value.trim() || 'Untitled Note';
    const content = quill.root.innerHTML; 
    
    const tempNote = {
        title: title,
        content: content,
        date: state.notes.find(n => n.id === currentEditingNoteId)?.date || 
              new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        id: currentEditingNoteId || Date.now().toString() 
    };

    const noteFile = createNoteFile(tempNote);
    

    if (noteFile) {
        executeDownload(noteFile);
        console.log(`Download initiated for: ${title}`);
    } 
}

// --- CONSTANTS & STATE ---

const GRADE_POINTS = {
    'A': 5.0, 'B': 4.0, 'C': 3.0, 'D': 2.0, 'E': 1.0, 'F': 0.0
};
const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const HOUR_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

const getInitialState = () => {
    const storedState = localStorage.getItem('uniportalState');
    if (storedState) {
        return JSON.parse(storedState);
    }
    return {
        userName: "New User",
        studentId: "S00123456",
        major: "Computer Science",
        email: "user@unistident.edu",
        currentSemester: 1,
        theme: 'light',
        currentSection: 'overview',
        notifications: [],
        courses: [],
        semesters: [
            { name: "Fall 2023", gpa: 3.2, totalPoints: 48, totalUnits: 15, courses: [] },
            { name: "Rise 2024", gpa: 3.8, totalPoints: 57, totalUnits: 15, courses: [] },
        ],
        timetable: {},
        notes: [],
        exams: [],
    };
};

let state = getInitialState();
let gpaChartInstance = null;
let quill;
let currentEditingNoteId = null;

function saveState() {
    localStorage.setItem('uniportalState', JSON.stringify(state));
}
  // Show save indicator (optional but nice UX)
    showSaveIndicator();


function showSaveIndicator() {
    // Check if indicator already exists
    let indicator = document.getElementById('save-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.innerHTML = '<i class="fas fa-check"></i> Saved';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--color-success);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 9999;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        document.body.appendChild(indicator);
    }
    
    // Trigger animation
    setTimeout(() => indicator.style.opacity = '1', 10);
    setTimeout(() => indicator.style.opacity = '0', 1500);
}

// --- MODAL FUNCTIONS ---

function openModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        modalElement.style.display = 'block';
    } else {
        console.warn(`Modal with ID "${modalId}" not found.`);
    }
}


function closeModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        modalElement.style.display = 'none';
    }
}

function openDownloadModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        populateDownloadList();
        modal.style.display = 'block';
    }
}

// --- SECTION SWITCHING ---

function switchSection(targetSectionId) {
    document.querySelectorAll('.content-section').forEach(section => {

        section.classList.remove('active');
    });

    const targetSection = document.getElementById(targetSectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        state.currentSection = targetSectionId;
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeLink = document.querySelector(`.nav-item[data-section="${targetSectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    if (targetSectionId === 'overview') renderOverview();
    if (targetSectionId === 'gpa-calc') renderGPATable();
    if (targetSectionId === 'cgpa-calc') renderCGPAHistory();
    if (targetSectionId === 'timetable') renderTimetable();
    if (targetSectionId === 'notes') renderNotesGrid();
    if (targetSectionId === 'countdown') renderExamList();
    saveState();
}

// --- USER NAME ---
function updateUserNameDisplay(newName) {
    state.userName = newName;
    const userDisplayName = document.getElementById('user-display-name');
    if (userDisplayName) userDisplayName.textContent = newName;
    const welcomeElement = document.getElementById('welcome-user-display');
    if (welcomeElement) welcomeElement.textContent = `Welcome, ${newName}`;
    const profileNameElement = document.getElementById('profile-user-name');
    if (profileNameElement) profileNameElement.textContent = `${newName}'s Account`;
    document.title = `${newName}'s Student Dashboard`;
    saveState();
}

// --- THEME TOGGLE ---
function setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    if (!themeToggle) return;

    if (state.theme === 'dark') {
        body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }

    themeToggle.addEventListener('click', () => {
        if (body.classList.contains('dark-theme')) {
            body.classList.remove('dark-theme');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            state.theme = 'light';
        } else {
            body.classList.add('dark-theme');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            state.theme = 'dark';
        }
        saveState();
        // Re-render chart if active to apply theme colors
        if (state.currentSection === 'overview' && gpaChartInstance) {
            renderOverview();
        }
    });
}

// --- NOTIFICATIONS RENDERING ---

// Helper function to render a time stamp nicely
function getTimeAgo(date) {
    const now = new Date();
    const then = new Date(date);
    const diffInSeconds = Math.floor((now - then) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} days ago`;
    
    return then.toLocaleDateString();
}

function renderNotifications() {
    const notificationList = document.getElementById('notification-list');
    const notificationBadge = document.getElementById('notification-badge');
    const noNotifications = document.querySelector('.no-notifications');
    const dashboardList = document.getElementById('notification-list-dashboard');

    if (!notificationList || !notificationBadge || !noNotifications || !dashboardList) return;

    // In-App Dropdown List
    notificationList.innerHTML = '';
    const unreadCount = state.notifications.length; 

    if (unreadCount > 0) {
        state.notifications.forEach(note => {
            const li = document.createElement('li');
            li.innerHTML = `<p>${note.message}</p><small>${note.time}</small>`;
            notificationList.appendChild(li);
        });
        noNotifications.style.display = 'none';
        notificationBadge.textContent = unreadCount;
        notificationBadge.classList.remove('hidden');
    } else {
        noNotifications.style.display = 'block';
        notificationBadge.classList.add('hidden');
    }

    // Dashboard Widget List (show max 5)
    dashboardList.innerHTML = '';
    if (unreadCount > 0) {
        state.notifications.slice(0, 5).forEach(note => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-circle-info"></i> ${note.message}`;
            dashboardList.appendChild(li);
        });
        dashboardList.querySelector('.no-data')?.remove();
    } else {
        dashboardList.innerHTML = '<li class="no-data">No recent alerts.</li>';
    }
}

function setupNotificationClear() {
    const clearBtn = document.getElementById('clear-notifications-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (state.notifications.length > 0) {
                state.notifications = [];
                saveState();
                renderNotifications();
                clearBtn.textContent = 'Cleared!';
                clearBtn.style.backgroundColor = 'var(--color-success)';

                setTimeout(() => {
                    clearBtn.innerHTML = '<i class="fas fa-trash"></i> Clear All';
                }, 1500);
            } else {
                alert('No notifications to clear');
            }
        });
    }
}

// --- OVERVIEW SECTION ---
function renderOverview() {
    const now = new Date();
    const { gpa: currentGpa } = calculateGPA(state.courses);
    const { cgpa: cumulativeCgpa } = calculateCGPA();
    
    const totalCoursesCount = document.getElementById('total-courses-count');
    const currentGpaDisplay = document.getElementById('current-gpa-display');
    const cumulativeCgpaDisplay = document.getElementById('cumulative-cgpa-display');

    if (totalCoursesCount) totalCoursesCount.textContent = state.courses.length;
    if (currentGpaDisplay) currentGpaDisplay.textContent = state.courses.length > 0 ? currentGpa.toFixed(2) : 'N/A';
    if (cumulativeCgpaDisplay) cumulativeCgpaDisplay.textContent = state.semesters.length > 0 ? cumulativeCgpa.toFixed(2) : 'N/A';

    // Upcoming Class
    const today = now.toLocaleString('en-us', { weekday: 'long' });
    const todayClasses = state.timetable[today] || [];
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const upcomingClass = todayClasses
        .map(cls => {
            const timeParts = cls.time.match(/(\d+):(\d+) (AM|PM)/);
            if (!timeParts) return null;

            let h = parseInt(timeParts[1]);
            const m = parseInt(timeParts[2]);
            const meridiem = timeParts[3];

            if (meridiem === 'PM' && h !== 12) h += 12;
            if (meridiem === 'AM' && h === 12) h = 0;

            const classMinutes = h * 60 + m;

            // Only consider classes that start in the future
            if (classMinutes > currentTime) {
                return { ...cls, classMinutes };
            }
            return null;
        })
        .filter(cls => cls !== null)
        .sort((a, b) => a.classMinutes - b.classMinutes)[0]; // Get the nearest upcoming class

    const summaryCard = document.getElementById('upcoming-class-display');
    if (upcomingClass) {
        summaryCard.textContent = `${upcomingClass.code} at ${upcomingClass.time}`;
    } else {
        summaryCard.textContent = 'Nothing Today';
    }

    // --- FIX #2: Days to Next Exam ---
    const daysToExamDisplay = document.getElementById('days-to-exam-display');

    if (daysToExamDisplay) {
        if (state.exams && state.exams.length > 0) {
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);

            // Find the next upcoming exam
            const upcomingExams = state.exams
                .map(exam => {
                    // Create date object from stored date string (exam.date)
                    const examDate = new Date(exam.date + "T00:00:00"); 
                    // Calculate difference in days
                    const diffTime = examDate - todayDate;
                    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return { daysUntil, exam };
                })
                .filter(e => e.daysUntil >= 0) // Only today (0) or future exams
                .sort((a, b) => a.daysUntil - b.daysUntil); // Sort by nearest

            if (upcomingExams.length > 0) {
                // Set the text content to ONLY the number of days
                daysToExamDisplay.textContent = upcomingExams[0].daysUntil; 
            } else {
                daysToExamDisplay.textContent = 'N/A';
            }
        } else {
            daysToExamDisplay.textContent = 'N/A';
        }
    }
    // --- END FIX #2 ---

    // Motivational Quote logic
    const quoteElement = document.getElementById('motivational-quote');
    const todayQuote = getDailyQuote();
    if (quoteElement) quoteElement.textContent = todayQuote;

    // --- FIX #4 (Part 2): Ensure GPA Chart is rendered ---
    // Destroy previous instance to prevent Chart.js errors when redrawing
    if (gpaChartInstance) {
        gpaChartInstance.destroy();
    }
    createGPAChart(state.semesters); 
    // --- END FIX #4 ---

    renderRecentNotes();
    // This is where renderUpcomingExams should be if you had a separate function for that
}

function renderRecentNotes() {
    const recentNotesList = document.getElementById('recent-notes-list');
    if (!recentNotesList) return;

    recentNotesList.innerHTML = '';
    const recentNotes = [...state.notes].sort((a, b) => b.id - a.id).slice(0, 3);

    if (recentNotes.length === 0) {
        recentNotesList.innerHTML = '<p class="no-data">No notes saved yet.</p>';
        return;
    }

    recentNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'recent-note-item';
        item.setAttribute('data-id', note.id);
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content;
        const snippet = tempDiv.textContent.substring(0, 50).trim() + '...';

        item.innerHTML = `
            <h4>${note.title}</h4>
            <p>${snippet}</p>
            <small>${note.date}</small>
        `;
        
        item.addEventListener('click', () => {
            openNoteEditor(note.id);
        });
        
        recentNotesList.appendChild(item);
    });
}

function getDailyQuote() {
    const quotes = [
        "The best way to predict the future is to create it.",
        "Success is not final, failure is not fatal: it is the courage to continue that counts.",
        "The beautiful thing about learning is that no one can take it away from you.",
        "Strive for progress, not perfection.",
        "Discipline is the bridge between goals and success.",
        "Your education is a dress rehearsal for a life that is yours to lead.",
        "The mind is not a vessel to be filled, but a fire to be kindled.",
        "The only place where success comes before work is in the dictionary."
    ];
    // Simple daily selection based on the day of the year
    const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    return quotes[day % quotes.length];
}

// --- CHART.JS SETUP (FIX #4) ---

function createGPAChart(semesters) {
    const ctx = document.getElementById('gpa-progress-chart-canvas');
    if (!ctx) return;

    const sortedSemesters = [...semesters].sort((a, b) => {
        // Simple sort assuming names are like 'Fall 2023' or rely on index if names are not unique/sortable
        if (a.name.match(/\d{4}/) && b.name.match(/\d{4}/)) {
             return a.name.localeCompare(b.name);
        }
        return 0;
    });

    const labels = sortedSemesters.map(sem => sem.name);
    const gpaValues = sortedSemesters.map(sem => sem.gpa);

    // Get theme colors for responsive chart styling
    const bodyStyles = getComputedStyle(document.body);
    const primaryColor = bodyStyles.getPropertyValue('--color-primary').trim();
    const accentColor = bodyStyles.getPropertyValue('--color-accent').trim();
    const textColor = bodyStyles.getPropertyValue('--color-text').trim();
    const borderColor = bodyStyles.getPropertyValue('--color-border').trim();

    // Destroy existing chart instance before creating a new one (Managed in renderOverview now)
    // if (gpaChartInstance) gpaChartInstance.destroy(); 

    gpaChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Semester GPA',
                data: gpaValues,
                borderColor: primaryColor,
                backgroundColor: primaryColor + '40',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: accentColor,
                pointBorderColor: primaryColor,
                pointBorderWidth: 2,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 5.0,
                    title: {
                        display: true,
                        text: 'GPA',
                        color: textColor
                    },
                    grid: {
                        color: borderColor,
                    },
                    ticks: {
                        color: textColor
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: textColor
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// --- GPA CALCULATOR ---
function calculateGPA(courses) {
    if (courses.length === 0) return { gpa: 0, totalPoints: 0, totalUnits: 0 };

    let totalPoints = 0;
    let totalUnits = 0;

    courses.forEach(course => {
        const gradeValue = GRADE_POINTS[course.grade.toUpperCase()];
        if (gradeValue !== undefined) {
            totalPoints += gradeValue * course.units;
            totalUnits += course.units;
        }
    });

    const gpa = totalUnits === 0 ? 0 : totalPoints / totalUnits;
    return { gpa, totalPoints, totalUnits };
}

function getAcademicStanding(gpa) {
    if (gpa >= 4.5) return 'Distinction';
    if (gpa >= 3.5) return 'Great';
    if (gpa >= 2.5) return 'Good';
    if (gpa >= 1.0) return 'Pass';
    return 'Probation';
}

function renderGPATable() {
    const courseList = document.getElementById('gpa-course-list');
    if (!courseList) return;

    courseList.innerHTML = '';
    
    if (state.courses.length === 0) {
        courseList.innerHTML = '<tr><td colspan="4" class="no-data">Click "Add Course" to begin.</td></tr>';
        return;
    }

    state.courses.forEach((course, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" value="${course.code}" data-field="code" data-index="${index}" placeholder="e.g., CSC101" class="input-code" required></td>
            <td><input type="number" value="${course.units}" data-field="units" data-index="${index}" min="1" max="10" placeholder="Units" class="input-units" required></td>
            <td>
                <select data-field="grade" data-index="${index}" class="select-grade" required>
                    ${Object.keys(GRADE_POINTS).map(grade => 
                        `<option value="${grade}" ${course.grade.toUpperCase() === grade ? 'selected' : ''}>${grade}</option>`
                    ).join('')}
                </select>
            </td>
            <td><button class="btn btn-danger btn-small remove-course-btn" data-index="${index}"><i class="fas fa-trash"></i></button></td>
        `;
        courseList.appendChild(row);
    });

    // Attach listeners dynamically
    courseList.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', updateCourseData);
    });
    courseList.querySelectorAll('.remove-course-btn').forEach(button => {
        button.addEventListener('click', removeCourse);
    });

    // Calculate initial GPA on render
    handleCalculateGPA();
}

function addCourse() {
    const newCourse = { code: '', units: 3, grade: 'A' };
    state.courses.push(newCourse);
    renderGPATable();
    saveState();
}

function updateCourseData(e) {
    const index = parseInt(e.target.getAttribute('data-index'));
    const field = e.target.getAttribute('data-field');
    const value = field === 'units' ? parseInt(e.target.value) : e.target.value;

    if (state.courses[index]) {
        state.courses[index][field] = value;
        handleCalculateGPA();
        saveState();
    }
}

function removeCourse(e) {
    const index = parseInt(e.currentTarget.getAttribute('data-index'));
    state.courses.splice(index, 1);
    renderGPATable();
    saveState();
}

function handleCalculateGPA() {
    const { gpa, totalUnits } = calculateGPA(state.courses);
    const gpaFeedback = document.getElementById('gpa-feedback');
    const gpaResult = document.getElementById('gpa-result');
    const academicStanding = document.getElementById('academic-standing');
    const saveSemesterBtn = document.getElementById('save-semester-btn');
    const confetti = document.getElementById('confetti-overlay');


    if (totalUnits === 0) {
        if (gpaFeedback) gpaFeedback.textContent = "Add courses and units to calculate your GPA.";
        if (gpaResult) gpaResult.textContent = 'N/A';
        if (academicStanding) academicStanding.textContent = 'Pending';
        if (saveSemesterBtn) saveSemesterBtn.disabled = true;
        if (confetti) confetti.classList.remove('active');
        return;
    }

    if (gpaResult) gpaResult.textContent = gpa.toFixed(2);
    if (academicStanding) academicStanding.textContent = getAcademicStanding(gpa);
    if (saveSemesterBtn) saveSemesterBtn.disabled = false;

    if (gpa >= 4.0) {
        if (gpaFeedback) gpaFeedback.textContent = "Excellent work! Keep setting high standards.";
        if (confetti) {
             confetti.classList.add('active');
             setTimeout(() => confetti.classList.remove('active'), 5000);
        }
        
    } else if (gpa >= 3.0) {
        if (gpaFeedback) gpaFeedback.textContent = "Good job! A little more effort for a better class.";
        if (confetti) confetti.classList.remove('active');

    } else {
        if (gpaFeedback) gpaFeedback.textContent = "Time to review your strategy and improve next time.";
        if (confetti) confetti.classList.remove('active');
    }
}

function handleSaveSemester() {
    const semName = prompt("Enter a name for this semester (e.g., Fall 2024):");
    if (!semName || semName.trim() === "") {
        alert("Semester name cannot be empty.");
        return;
    }
    
    const { gpa, totalPoints, totalUnits } = calculateGPA(state.courses);

    if (totalUnits === 0) {
        alert("Cannot save an empty semester.");
        return;
    }
    
    // Check for duplicate name
    if (state.semesters.some(sem => sem.name.toLowerCase() === semName.trim().toLowerCase())) {
        alert(`A semester named "${semName.trim()}" already exists. Please use a unique name.`);
        return;
    }

    const newSemester = {
        name: semName.trim(),
        gpa: parseFloat(gpa.toFixed(2)),
        totalPoints: totalPoints,
        totalUnits: totalUnits,
        // Save a copy of the courses for historical record
        courses: JSON.parse(JSON.stringify(state.courses)) 
    };
    
    state.semesters.push(newSemester);
    state.courses = []; // Clear current courses for the next semester
    
    saveState();
    renderGPATable(); // Rerender to show cleared table
    renderCGPAHistory(); // Update CGPA history
    renderOverview(); // Update dashboard chart/CGPA
    
    alert(`✅ Semester "${newSemester.name}" saved successfully!`);
}


// --- CGPA CALCULATOR ---
function calculateCGPA() {
    let cumulativePoints = 0;
    let cumulativeUnits = 0;

    // Sum points and units from saved semesters
    state.semesters.forEach(sem => {
        cumulativePoints += sem.totalPoints;
        cumulativeUnits += sem.totalUnits;
    });

    // Also include points and units from the *current* semester if courses exist
    const { totalPoints: currentPoints, totalUnits: currentUnits } = calculateGPA(state.courses);

    cumulativePoints += currentPoints;
    cumulativeUnits += currentUnits;

    const cgpa = cumulativeUnits === 0 ? 0 : cumulativePoints / cumulativeUnits;
    
    return { cgpa, cumulativePoints, cumulativeUnits };
}

function handleManualSemesterAdd(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('manual-sem-name');
    const gpaInput = document.getElementById('manual-sem-gpa');
    const unitsInput = document.getElementById('manual-sem-units');
    
    const name = nameInput.value.trim();
    const gpa = parseFloat(gpaInput.value);
    const units = parseInt(unitsInput.value);
    
    if (state.semesters.some(sem => sem.name.toLowerCase() === name.toLowerCase())) {
        alert(`A semester named "${name}" already exists. Please use a unique name.`);
        return;
    }

    if (!name || isNaN(gpa) || isNaN(units) || gpa < 0 || gpa > 5 || units < 1) {
        alert("Please enter valid data (GPA between 0-5.0, Units > 0).");
        return;
    }
    
    const totalPoints = gpa * units;

    const newSemester = {
        name: name,
        gpa: parseFloat(gpa.toFixed(2)),
        totalPoints: totalPoints,
        totalUnits: units,
        courses: [] // Manual semesters don't track individual courses
    };
    
    state.semesters.push(newSemester);
    saveState();
    renderCGPAHistory();
    closeModal('cgpa-manual-modal');
    e.target.reset();
}

function renderCGPAHistory() {
    const list = document.getElementById('cgpa-semester-list');
    if (!list) return;

    list.innerHTML = '';

    if (state.semesters.length === 0) {
        list.innerHTML = '<p class="no-data">No semesters saved yet. Calculate and save a GPA first.</p>';
        handleCalculateCGPA(); // Ensure CGPA displays 0.00
        return;
    }

    state.semesters.forEach((sem, index) => {
        const card = document.createElement('div');
        card.className = 'semester-card';
        card.innerHTML = `
            <h4>${sem.name}</h4>
            <p>GPA: <strong>${sem.gpa.toFixed(2)}</strong></p>
            <p>Units: ${sem.totalUnits}</p>
            <button class="btn btn-danger btn-small remove-sem-btn" data-index="${index}"><i class="fas fa-trash"></i> Remove</button>
        `;
        list.appendChild(card);
    });

    list.querySelectorAll('.remove-sem-btn').forEach(btn => {
        btn.addEventListener('click', removeSemester);
    });

    handleCalculateCGPA();
}

function handleCalculateCGPA() {
    const { cgpa, cumulativeUnits } = calculateCGPA();
    const cgpaResultDisplay = document.getElementById('cgpa-result-display');
    const cgpaTotalUnits = document.getElementById('cgpa-total-units');
    const cgpaAcademicStanding = document.getElementById('cgpa-academic-standing');
    const progressCircle = document.getElementById('cgpa-progress-circle');

    if (cgpaResultDisplay) cgpaResultDisplay.textContent = cgpa.toFixed(2);
    if (cgpaTotalUnits) cgpaTotalUnits.textContent = cumulativeUnits;
    if (cgpaAcademicStanding) cgpaAcademicStanding.textContent = getAcademicStanding(cgpa);

    if (progressCircle) {
        let color;
        if (cgpa >= 4.0) color = 'var(--color-success)';
        else if (cgpa >= 3.0) color = 'var(--color-accent)';
        else color = 'var(--color-danger)';
        progressCircle.style.borderColor = color;
    }

    renderOverview();
}

function removeSemester(e) {
    const index = parseInt(e.currentTarget.getAttribute('data-index'));
    if (confirm(`Are you sure you want to remove ${state.semesters[index].name}?`)) {
        state.semesters.splice(index, 1);
        renderCGPAHistory();
        renderOverview();
        saveState();
        alert("Semester removed.");
    }
}


// --- TIMETABLE ---

function convertTo12Hour(time24) {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const time = new Date(0, 0, 0, h, m);
    return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function renderTimetable() {
    const tbody = document.getElementById('timetable-body');
    const noDataMessage = document.getElementById('no-timetable-data');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Check if there are any classes scheduled at all
    const hasClasses = Object.values(state.timetable).some(dayClasses => dayClasses.length > 0);
    if (!hasClasses) {
        if (noDataMessage) noDataMessage.style.display = 'block';
        return;
    }
    
    if (noDataMessage) noDataMessage.style.display = 'none';

    // Create a set of all unique hours used across all days
    const uniqueHours = new Set();
    Object.values(state.timetable).forEach(dayClasses => {
        dayClasses.forEach(cls => {
            const h = parseInt(cls.time.match(/(\d+):/)[1]);
            uniqueHours.add(h);
        });
    });
    
    // Use a fixed hour slot list for consistent grid (8 AM to 5 PM)
    const hours = HOUR_SLOTS.filter(h => h >= 8 && h <= 17);

    // Header Row (Days)
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>Time Slot</th>' + DAYS_OF_WEEK.map(day => `<th>${day}</th>`).join('');
    tbody.appendChild(headerRow);


    hours.forEach(hour => {
        const timeSlot12Hr = convertTo12Hour(`${hour}:00`);
        const tr = document.createElement('tr');
        
        // Time Slot Cell
        const timeCell = document.createElement('td');
        timeCell.className = 'time-slot';
        timeCell.textContent = timeSlot12Hr;
        tr.appendChild(timeCell);
        
        // Day Cells
        DAYS_OF_WEEK.forEach(day => {
            const dayCell = document.createElement('td');
            dayCell.className = 'class-cell';
            
            const dayClasses = state.timetable[day] || [];
            
            dayClasses.forEach(cls => {
                // Check if this class falls within this hour slot
                const classHour = parseInt(cls.time.match(/(\d+)/)[1]);
                const classMeridiem = cls.time.match(/(AM|PM)/i)[1];
                let h24 = classHour;
                if (classMeridiem === 'PM' && h24 !== 12) h24 += 12;
                if (classMeridiem === 'AM' && h24 === 12) h24 = 0; // Midnight edge case

                if (h24 === hour) {
                    const classDiv = document.createElement('div');
                    classDiv.className = 'timetable-class';
                    classDiv.innerHTML = `<strong>${cls.code}</strong><br>${cls.subject}<br><small>${cls.time}</small>`;
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-class-btn';
                    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
                    deleteBtn.setAttribute('data-day', day);
                    deleteBtn.setAttribute('data-time', cls.time);
                    deleteBtn.addEventListener('click', removeClass);

                    classDiv.appendChild(deleteBtn);
                    dayCell.appendChild(classDiv);
                }
            });
            
            tr.appendChild(dayCell);
        });
        
        tbody.appendChild(tr);
    });
}

function handleAddClass(e) {
    e.preventDefault();
    
    const code = document.getElementById('class-code').value.trim().toUpperCase();
    const subject = document.getElementById('class-subject').value.trim();
    const day = document.getElementById('class-day').value;
    const time24 = document.getElementById('class-time').value;

    if (!code || !subject || !day || !time24) return alert("Please fill all class fields.");

    const time12 = convertTo12Hour(time24);
    
    const newClass = { code, subject, time: time12 };
    
    if (!state.timetable[day]) {
        state.timetable[day] = [];
    }

    // Conflict Check (Only checks hour, good enough for simple timetable)
    const h = parseInt(time24.split(':')[0]); 

    const existingClass = state.timetable[day].find(cls => {
        const timeParts = cls.time.match(/(\d+):(\d+) (AM|PM)/);
        if (!timeParts) return false;
        
        let existingH = parseInt(timeParts[1]);
        const meridiem = timeParts[3];
        
        if (meridiem === 'PM' && existingH !== 12) existingH += 12;
        if (meridiem === 'AM' && existingH === 12) existingH = 0;
        
        return existingH === h;
    });

    if (existingClass) {
        return alert(`Time conflict! ${existingClass.code} is already scheduled at ${existingClass.time} on ${day}.`);
    }

    state.timetable[day].push(newClass);
    // Sort classes for the day by time (necessary for accurate upcoming class check)
    state.timetable[day].sort((a, b) => {
        return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });

    e.target.reset(); 
    renderTimetable();
    renderOverview(); // Update upcoming class display
    saveState();
}

function removeClass(e) {
    const day = e.currentTarget.getAttribute('data-day');
    const time = e.currentTarget.getAttribute('data-time');

    if (confirm(`Remove class on ${day} at ${time}?`)) {
        if (state.timetable[day]) {
            state.timetable[day] = state.timetable[day].filter(cls => cls.time !== time);
            
            // Clean up empty day array
            if (state.timetable[day].length === 0) {
                delete state.timetable[day];
            }
            
            saveState();
            renderTimetable();
            renderOverview();
        }
    }
}


// --- NOTES SECTION ---

function initializeQuill() {
    const editor = document.getElementById('note-editor');
    if (editor && !quill) {
        quill = new Quill('#note-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'color': [] }, { 'background': [] }],
                    ['clean']
                ]
            },
            placeholder: 'Start writing your note here...'
        });
    }
}


const openNoteEditor = (noteId = null) => {
    const noteTitleInput = document.getElementById('note-title-input');
    const noteEditorModal = document.getElementById('note-editor-modal');
    const deleteNoteBtn = document.getElementById('delete-note-btn');

    if (!quill) {
        console.error('Quill editor not initialized:', quill);
        alert("The note editor failed to load. Please refresh the page and try again.");
        return;
    }

    if (!noteEditorModal || !noteTitleInput) {
        console.error('Modal elements not found');
        return;
    }
    
    noteEditorModal.style.display = 'block';
    currentEditingNoteId = noteId; 

    // Clear editor content safely
    try {
        quill.root.innerHTML = '';
        noteTitleInput.value = '';
    } catch (error) {
        console.error('Error clearing editor:', error);
    }

    const editorTitle = document.getElementById('editor-title');
    
    if (noteId) {
        const note = state.notes.find(n => n.id === noteId);
        if (note) {
            if (editorTitle) editorTitle.textContent = 'Edit';
            noteTitleInput.value = note.title;
            try {
                quill.root.innerHTML = note.content;
            } catch (error) {
                console.error('Error loading note content:', error);
            }
            if (deleteNoteBtn) deleteNoteBtn.style.display = 'inline-flex';
        } else {
            if (editorTitle) editorTitle.textContent = 'Create';
            if (deleteNoteBtn) deleteNoteBtn.style.display = 'none';
            currentEditingNoteId = null;
        }
    } else {
        if (editorTitle) editorTitle.textContent = 'Create';
        if (deleteNoteBtn) deleteNoteBtn.style.display = 'none';
        currentEditingNoteId = null;
    }
};

const saveNote = () => {
    const noteTitleInput = document.getElementById('note-title-input');
    const noteEditorModal = document.getElementById('note-editor-modal');
    
    if (!quill || !noteTitleInput || !noteEditorModal) return;

    const title = noteTitleInput.value.trim();
    const content = quill.root.innerHTML.trim();
    
    if (title === '' || quill.getText().trim() === '') {
        alert("Note title and content cannot be empty.");
        return;
    }
    
    const now = new Date();
    const dateString = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    if (currentEditingNoteId) {
        // Update existing note
        const index = state.notes.findIndex(n => n.id === currentEditingNoteId);
        if (index !== -1) {
            state.notes[index] = {
                ...state.notes[index], // Preserve original date/id
                title: title,
                content: content,
                updated: now.toISOString() // Track update time
            };
        }
    } else {
        // Create new note
        const newNote = {
            id: Date.now().toString(),
            title: title,
            content: content,
            date: dateString,
            updated: now.toISOString()
        };
        state.notes.push(newNote);
    }
    
    saveState();
    renderNotesGrid();
    renderOverview(); // Update recent notes on dashboard
    closeModal('note-editor-modal');
    currentEditingNoteId = null;
    alert(`✅ Note "${title}" saved!`);
};

function deleteNote() {
    if (!currentEditingNoteId) return;

    const note = state.notes.find(n => n.id === currentEditingNoteId);

    if (confirm(`Are you sure you want to delete the note: "${note.title}"? This cannot be undone.`)) {
        state.notes = state.notes.filter(n => n.id !== currentEditingNoteId);
        saveState();
        renderNotesGrid();
        renderOverview(); // Update recent notes
        closeModal('note-editor-modal');
        currentEditingNoteId = null;
        alert("Note deleted.");
    }
}

function renderNotesGrid() {
    const grid = document.getElementById('notes-grid');
    if (!grid) return;

    grid.innerHTML = '';
    
    if (state.notes.length === 0) {
        grid.innerHTML = '<p class="no-data">Click "New Note" to start organizing your study materials.</p>';
        return;
    }
    
    // Sort by most recently updated/created
    const sortedNotes = [...state.notes].sort((a, b) => {
        const dateA = new Date(a.updated || a.id);
        const dateB = new Date(b.updated || b.id);
        return dateB - dateA;
    });


    sortedNotes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.setAttribute('data-id', note.id);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content;
        const snippet = tempDiv.textContent.substring(0, 150).trim() + '...';

        card.innerHTML = `
            <h3>${note.title}</h3>
            <div class="note-snippet">${snippet}</div>
            <p class="note-date"><i class="fas fa-calendar-alt"></i> ${note.date}</p>
            <div class="note-actions">
                <button class="btn btn-primary btn-small edit-note-btn"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-danger btn-small delete-note-grid-btn" data-id="${note.id}"><i class="fas fa-trash"></i></button>
            </div>
        `;

        card.querySelector('.edit-note-btn').addEventListener('click', () => {
            openNoteEditor(note.id);
        });
        
        // Listener for the delete button on the card (to allow quick deletion)
        card.querySelector('.delete-note-grid-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from propagating to card
            currentEditingNoteId = note.id; // Set ID for deleteNote function
            deleteNote();
        });

        grid.appendChild(card);
    });
}


// --- EXAM COUNTDOWN ---

function renderExamList() {
    const container = document.getElementById('exam-list-container');
    if (!container) return;

    container.innerHTML = '';

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize 'now' to start of day

    const examsWithDates = state.exams.map(exam => ({
        ...exam,
        dateObj: new Date(exam.date + "T00:00:00")
    }));

    const upcomingExams = examsWithDates.filter(exam => exam.dateObj >= now);
    const sortedExams = upcomingExams.sort((a, b) => a.dateObj - b.dateObj);

    if (sortedExams.length === 0) {
        container.innerHTML = '<p class="no-data">No upcoming exams scheduled. Focus Mode awaits!</p>';
        return;
    }

    sortedExams.forEach(exam => {
        const diffTime = Math.abs(exam.dateObj - now);
        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Handle exact day comparison for '0 Days'
        if (exam.dateObj.toDateString() === now.toDateString()) diffDays = 0; 
        
        const card = document.createElement('div');
        card.className = 'exam-card exam-item';
        card.innerHTML = `
            <h3>${exam.name}</h3>
            <p class="exam-date-display"><i class="fas fa-calendar-alt"></i> ${exam.dateObj.toDateString()}</p>
            <div class="countdown-display">${diffDays} <small>Days</small></div>
            <button class="btn btn-danger btn-small remove-exam-btn" data-id="${exam.id}"><i class="fas fa-trash"></i></button>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.remove-exam-btn').forEach(btn => btn.addEventListener('click', removeExam));
}

function handleAddExam(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('exam-name');
    const dateInput = document.getElementById('exam-date');
    if (!nameInput || !dateInput) return;

    const name = nameInput.value.trim();
    const dateStr = dateInput.value;
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0,0,0,0);

    if (!name || !dateStr || date < today) {
        return alert("Please enter a valid exam name and a future or current date.");
    }
    
    state.exams.push({
        id: Date.now().toString(), // Use string ID for consistency
        name: name,
        date: dateStr,
    });

    e.target.reset(); 
    renderExamList();
    renderOverview(); // Update overview days-to-exam
    saveState();
}

function removeExam(e) {
    const id = e.currentTarget.getAttribute('data-id');
    if (confirm("Are you sure you want to remove this exam?")) {
        state.exams = state.exams.filter(exam => exam.id !== id);
        saveState();
        renderExamList();
        renderOverview();
        alert("Exam removed.");
    }
}


// --- PROFILE ---

function loadProfileData() {
    const profileForm = document.getElementById('profile-update-form');
    if (!profileForm) return;

    document.getElementById('full-name').value = state.userName;
    document.getElementById('major').value = state.major;
    document.getElementById('current-semester').value = state.currentSemester;
    
    // Display read-only values
    document.getElementById('student-id').value = state.studentId;
    document.getElementById('email').value = state.email;

    // Display values in info card
    document.getElementById('profile-email-display').textContent = state.email;
    document.getElementById('profile-major-display').textContent = state.major;
    document.getElementById('profile-semester-display').textContent = state.currentSemester;
    
    // Update all user name displays
    updateUserNameDisplay(state.userName);
}

function handleProfileUpdate(event) {
    event.preventDefault();
    
    const newName = document.getElementById('full-name').value.trim();
    const newMajor = document.getElementById('major').value.trim();
    const newSemester = parseInt(document.getElementById('current-semester').value);
    const newStudentId = document.getElementById('student-id').value.trim();
    const newEmail = document.getElementById('email').value.trim();

    if (!newName || !newMajor || isNaN(newSemester) || newSemester < 1) {
        return alert("Please ensure Name, Major, and Semester are valid.");
    }

    if (newName !== state.userName) {
        updateUserNameDisplay(newName);
    }
    
    state.major = newMajor;
    state.currentSemester = newSemester;
    state.studentId = newStudentId;
    state.email = newEmail;

    saveState();
    loadProfileData(); // Reload to update all displays

    // Visual feedback
    const saveButton = event.target.querySelector('.btn-accent');
    if (saveButton) {
        const originalText = saveButton.textContent;
        saveButton.textContent = '✓ Changes Saved!';
        saveButton.style.backgroundColor = 'var(--color-success)';
        setTimeout(() => {
            saveButton.textContent = originalText;
            saveButton.style.backgroundColor = '';
        }, 2000);
    }
    
    alert(`✅ Profile updated successfully!\n\nMajor: ${newMajor}\nSemester: ${newSemester}`);
}

function handleLogout() {
    if (confirm("Are you sure you want to log out? All local data will be reset.")) {
        localStorage.removeItem('uniportalState');
        localStorage.removeItem('userAvatarDataURL');
        alert("Logged out successfully! The dashboard will reset.");
        window.location.reload();
    }
}

function handleResetData() {
    if (confirm("WARNING: Are you sure you want to PERMANENTLY reset ALL your dashboard data? This action cannot be undone.")) {
        localStorage.removeItem('uniportalState');
        localStorage.removeItem('userAvatarDataURL');
        localStorage.removeItem('lastDailySummary');
        sessionStorage.clear(); // Clear session-based notifications
        alert("Data successfully reset! Reloading UniPortal.");
        window.location.reload();
    }
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Avatar Upload
    const navInput = document.getElementById('avatar-input-nav');
    const profileInput = document.getElementById('avatar-input-profile');
    const navImage = document.getElementById('user-avatar-nav');
    const profileImage = document.getElementById('profile-avatar-img');
    const AVATAR_STORAGE_KEY = 'userAvatarDataURL';

    const updateAndPersistAvatar = (file) => {
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const dataURL = e.target.result;
                if (navImage) navImage.src = dataURL;
                if (profileImage) profileImage.src = dataURL;
                localStorage.setItem(AVATAR_STORAGE_KEY, dataURL);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        updateAndPersistAvatar(file);
    };

    if (navInput) navInput.addEventListener('change', handleAvatarChange);
    if (profileInput) profileInput.addEventListener('change', handleAvatarChange);

    // Load persisted avatar
    const storedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (storedAvatar) {
        if (navImage) navImage.src = storedAvatar;
        if (profileImage) profileImage.src = storedAvatar;
    }

    // Initialize Quill editor with a slight delay to ensure the DOM is ready for it
    setTimeout(initializeQuill, 50);

    setupThemeToggle();
    setupNotificationClear();
    requestNotificationPermission();
    scheduleNotificationChecks();
    
    // --- MAIN NAVIGATION AND RENDERING ---
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = item.getAttribute('data-section');
            if (targetSection) {
                switchSection(targetSection);
            }
        });
    });

    // Handle initial load based on saved state
    switchSection(state.currentSection);

    // GPA Calculator
    const addCourseBtn = document.getElementById('add-course-btn');
    if (addCourseBtn) addCourseBtn.addEventListener('click', addCourse);
    const calcGpaBtn = document.getElementById('calculate-gpa-btn');
    if (calcGpaBtn) calcGpaBtn.addEventListener('click', handleCalculateGPA);
    const saveSemBtn = document.getElementById('save-semester-btn');
    if (saveSemBtn) saveSemBtn.addEventListener('click', handleSaveSemester);

    // CGPA Calculator
    const cgpaCalcBtn = document.getElementById('calculate-cgpa-btn');
    if (cgpaCalcBtn) cgpaCalcBtn.addEventListener('click', handleCalculateCGPA);
    const addManualSemBtn = document.getElementById('add-manual-sem-btn');
    if (addManualSemBtn) {
        addManualSemBtn.addEventListener('click', () => openModal('cgpa-manual-modal'));
    }
    // FIXED: Attach the manual semester form handler
    const manualSemesterForm = document.getElementById('cgpa-manual-form');
    if (manualSemesterForm) {
        manualSemesterForm.addEventListener('submit', handleManualSemesterAdd);
    }

    // Timetable
    const addClassForm = document.getElementById('add-class-form');
    if (addClassForm) addClassForm.addEventListener('submit', handleAddClass);

    // Exams
    const addExamForm = document.getElementById('add-exam-form');
    if (addExamForm) addExamForm.addEventListener('submit', handleAddExam);
    const focusModeToggle = document.getElementById('focus-mode-toggle');
    if (focusModeToggle) {
        focusModeToggle.addEventListener('click', () => {
            alert("Focus Mode Activated: Minimizing distractions... (Placeholder)");
        });
    }

    // Profile
    const profileForm = document.getElementById('profile-update-form');
    if (profileForm) {
        loadProfileData();
        profileForm.addEventListener('submit', handleProfileUpdate);
    }
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Reset Data Button
    const resetDataBtn = document.getElementById('reset-data-btn');
    if (resetDataBtn) resetDataBtn.addEventListener('click', handleResetData);

    // --- FIX #3: Notes Close Button ---
    const closeNoteEditorBtn = document.getElementById('close-note-editor-btn');
    if (closeNoteEditorBtn) {
        closeNoteEditorBtn.addEventListener('click', () => {
            closeModal('note-editor-modal');
        });
    }
    // --- END FIX #3 ---

    // Notes - with slight delay to ensure Quill is ready
    const newNoteBtn = document.getElementById('new-note-btn');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const deleteNoteBtn = document.getElementById('delete-note-btn');
    const noteEditorModal = document.getElementById('note-editor-modal');
    const editorDownloadBtn = document.getElementById('editor-download-btn');
    const shareNoteBtn = document.getElementById('share-note-btn');
    const downloadNoteListBtn = document.getElementById('download-note-btn');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const closeDownloadModalBtn = document.getElementById('closeDownloadModalBtn');


    if (newNoteBtn) newNoteBtn.addEventListener('click', () => openNoteEditor(null));
    if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveNote);
    if (deleteNoteBtn) deleteNoteBtn.addEventListener('click', deleteNote);
    if (editorDownloadBtn) editorDownloadBtn.addEventListener('click', handleEditorDownload);
    
    if (shareNoteBtn) shareNoteBtn.addEventListener('click', () => openModal('shareNotesModal'));
    if (closeShareModalBtn) closeShareModalBtn.addEventListener('click', () => closeModal('shareNotesModal'));
    if (downloadNoteListBtn) downloadNoteListBtn.addEventListener('click', () => openDownloadModal('downloadNotesModal'));
    if (closeDownloadModalBtn) closeDownloadModalBtn.addEventListener('click', () => closeModal('downloadNotesModal'));
    
    // --- Initial Load Setup ---
    renderNotifications();
    
    // Hide loading overlay after content is rendered
    const loadingOverlay = document.getElementById('loading-overlay');
    const mainAppContainer = document.getElementById('main-app-container');
    const body = document.body;

    if (loadingOverlay && mainAppContainer) {
        body.classList.add('no-scroll');
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            mainAppContainer.classList.remove('main-content-hidden');
            mainAppContainer.classList.add('main-content-visible');
            setTimeout(() => {
                body.classList.remove('no-scroll');
            }, 600);
        }, 500); // Reduce delay for snappier feel
    }

    // --- FIX #1: Mobile Hamburger Menu - FIXED VERSION ---
    const createMobileMenu = () => {
        // Check if already exists
        if (document.getElementById('mobile-menu-toggle')) return;

        const hamburger = document.createElement('button');
        hamburger.id = 'mobile-menu-toggle';
        hamburger.innerHTML = '<i class="fas fa-bars"></i>';
        hamburger.setAttribute('aria-label', 'Toggle Menu');
        document.body.appendChild(hamburger);

        const sidebar = document.querySelector('.sidebar');

        // Show/hide based on screen size
        const toggleMenuVisibility = () => {
            if (window.innerWidth <= 768) {
                hamburger.style.display = 'block';
            } else {
                hamburger.style.display = 'none';
                // Ensure sidebar is closed when resizing to desktop
                sidebar.classList.remove('mobile-open'); 
            }
        };
        
        toggleMenuVisibility(); 

        // Toggle sidebar on click <--- THE FIX IS HERE
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });

        // Also close the sidebar when a link inside is clicked
        sidebar.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('mobile-open');
                }
            });
        });

        window.addEventListener('resize', toggleMenuVisibility);
    };

    createMobileMenu();
    // --- END FIX #1 ---

    /* Test Notification Buttons
    const testButtonsContainer = document.createElement('div');
    testButtonsContainer.innerHTML = `<button id="test-notif-btn" style="position:fixed; bottom: 70px; right: 20px; z-index: 10000; background: red; color: white; padding: 10px;">Test Notif</button>`;
    document.body.appendChild(testButtonsContainer);
    document.getElementById('test-notif-btn').addEventListener('click', testNotification);

    // Remove test buttons after 30 seconds (or remove this block entirely after testing)
    setTimeout(() => {
        testButtonsContainer.remove();
    }, 30000);*/
});
    const exportBtn = document.getElementById('export-data-btn');
const importInput = document.getElementById('import-file-input');


if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
}

if (importInput) {
    importInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importData(e.target.files[0]);
        }
    });
}


// Add Export/Import functionality for backup
function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const dataBlob = new Blob([dataStr], { 

type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `UniPortal_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            state = importedState;
            saveState();
            window.location.reload();
            alert("✅ Data imported successfully! UniPortal is reloading.");
        } catch (error) {
            console.error("Error parsing imported file:", error);
            alert("❌ Failed to import data. Please ensure the file is a valid UniPortal JSON backup.");
        }
    };
    reader.readAsText(file);
}
