
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
    });
}

// --- NOTIFICATIONS ---

function renderNotifications() {
    const notificationList = document.getElementById('notification-list');
    const notificationBadge = document.getElementById('notification-badge');
    const notificationBell = document.getElementById('notification-bell');
    const notificationDropdown = document.getElementById('notification-dropdown');
    const noNotifications = document.querySelector('.no-notifications');
    
    if (!notificationList || !notificationBell || !notificationDropdown) return;
    
    notificationList.innerHTML = '';
    
    // Clone bell to remove old listeners
    const newBell = notificationBell.cloneNode(true);
    notificationBell.parentNode.replaceChild(newBell, notificationBell);
    
    if (state.notifications && state.notifications.length > 0) {
        if (noNotifications) noNotifications.style.display = 'none';
        if (notificationBadge) {
            notificationBadge.textContent = state.notifications.length;
            notificationBadge.classList.remove('hidden');
        }
        
        state.notifications.slice(0, 10).forEach(note => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${note.message}</strong> - <small>${note.time}</small>`;
            notificationList.appendChild(li);
        });
    } else {
        if (noNotifications) noNotifications.style.display = 'block';
        if (notificationBadge) notificationBadge.classList.add('hidden');
    }
    
    notificationDropdown.classList.remove('active');
    
    // Toggle dropdown
    newBell.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationDropdown.classList.toggle('active');
    });
    
    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!notificationDropdown.contains(e.target) && !newBell.contains(e.target)) {
            notificationDropdown.classList.remove('active');
        }
    });
    
    // Setup clear button (this was missing!)
    setupClearNotificationsButton();
}

// Clear notifications button handler
function setupClearNotificationsButton() {
    const clearBtn = document.getElementById('clear-notifications-btn');
    
    if (clearBtn) {
        // Remove old listeners by cloning
        const newClearBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
        
        // Add new listener
        newClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (state.notifications && state.notifications.length > 0) {
                if (confirm('Clear all notifications?')) {
                    state.notifications = [];
                    saveState();
                    renderNotifications();
                    
                    // Visual feedback
                    newClearBtn.textContent = '✓ Cleared!';
                    setTimeout(() => {
                        newClearBtn.innerHTML = '<i class="fas fa-check"></i> Clear All';
                    }, 1500);
                }
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
    const currentGpaDisplay = 

document.getElementById('current-gpa-display');
    const cumulativeCgpaDisplay = document.getElementById('cumulative-cgpa-display');

    if (totalCoursesCount) totalCoursesCount.textContent = state.courses.length;
    if (currentGpaDisplay) currentGpaDisplay.textContent = state.courses.length > 0 ? currentGpa.toFixed(2) : 'N/A';
    if (cumulativeCgpaDisplay) cumulativeCgpaDisplay.textContent = state.semesters.length > 0 ? cumulativeCgpa.toFixed(2) : 'N/A';

    // Upcoming Class
    const today = now.toLocaleString('en-us', { weekday: 'long' });
    const todayClasses = 

state.timetable[today] || [];
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

            const classTime = h * 60 + m;
            return { ...cls, classTime };
        }).filter(cls => cls && cls.classTime > currentTime)
        .sort((a, b) => a.classTime - 

b.classTime)[0];

    const upcomingClassDisplay = document.getElementById('upcoming-class-display');
    if (upcomingClassDisplay) {
        if (upcomingClass) {
            upcomingClassDisplay.textContent = `${upcomingClass.code} at ${upcomingClass.time}`;
        } else {
            upcomingClassDisplay.textContent = 'No more classes today!';
        }
    }
    
    // Next Exam
    const nextExam = state.exams.map(exam => ({
        ...exam,
        date: new Date(exam.date)
    })).filter(exam => exam.date > now)

     .sort((a, b) => a.date - b.date)[0];

    const daysToExamDisplay = document.getElementById('days-to-exam-display');
    if (daysToExamDisplay) {
        if (nextExam) {
            const diffTime = Math.abs(nextExam.date - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            daysToExamDisplay.textContent = `${diffDays} days to ${nextExam.name}`;
        } else {
            daysToExamDisplay.textContent = 'No exams scheduled.';
        }
    }
    
    renderGpaProgressChart();
}

function renderGpaProgressChart() {
    const chartData = state.semesters;
    const chartPlaceholder = document.querySelector('.chart-placeholder');
    
    if (!chartPlaceholder) return;

    chartPlaceholder.innerHTML = '<canvas id="gpaProgressChart"></canvas>';
    const ctx = document.getElementById('gpaProgressChart');
    
    if (chartData.length < 1) {
        chartPlaceholder.innerHTML = '<p class="no-data">Save at least one semester to see GPA progress.</p>';
        return;
    }

    const labels = chartData.map(s => 

s.name);
    const gpaValues = chartData.map(s => s.gpa.toFixed(2));
    
    if (gpaChartInstance) {
        gpaChartInstance.destroy();
    }

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim();
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();

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
    if (gpa >= 3.5) return 'Great Job';
    if (gpa >= 2.0) return 'Satisfactory';
    return 'Review Required';
}

function renderGPATable() {
    const list = document.getElementById('gpa-course-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (state.courses.length === 0) {
        state.courses.push({ id: Date.now(), 

code: 'CSC 101', units: 3, grade: 'A' });
    }

    state.courses.forEach((course, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${course.code}" data-field="code" class="course-input" data-index="${index}"></td>
            <td><input type="number" value="${course.units}" min="1" max="6" data-field="units" class="units-input" data-index="${index}"></td>
            <td>
                <select data-field="grade" class="grade-select" data-index="${index}">
                    ${Object.keys(GRADE_POINTS).map(g => `<option value="${g}" ${course.grade === g 

? 'selected' : ''}>${g}</option>`).join('')}
                </select>
            </td>
            <td><button class="btn btn-danger btn-small remove-course-btn" data-index="${index}"><i class="fas fa-trash"></i></button></td>
        `;
        list.appendChild(tr);
    });
    
    list.querySelectorAll('.course-input, .units-input, .grade-select').forEach(input => {
        input.addEventListener('change', updateCourseData);
    });
    list.querySelectorAll('.remove-course-btn').forEach(button => {
        button.addEventListener('click', removeCourse);
    });

    const { gpa } = calculateGPA(state.courses);
    
    const gpaResult = document.getElementById('gpa-result');
    const academicStanding = document.getElementById('academic-standing');
    const saveSemesterBtn = document.getElementById('save-semester-btn');
    
    if (gpaResult) gpaResult.textContent = state.courses.length > 0 ? gpa.toFixed(2) : 'N/A';
    if (academicStanding) academicStanding.textContent = getAcademicStanding(gpa);
    if (saveSemesterBtn) saveSemesterBtn.disabled = gpa === 0;
}

function addCourse() {
    state.courses.push({ id: Date.now(), code: '', units: 3, grade: 'A' });
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

    if (totalUnits === 0) {
        if (gpaFeedback) gpaFeedback.textContent = "Add courses and units to calculate your GPA.";
        if (gpaResult) gpaResult.textContent = 'N/A';
        if (academicStanding) academicStanding.textContent = 'Pending';
        if (saveSemesterBtn) saveSemesterBtn.disabled = true;
        return;
    }

    if (gpaResult) gpaResult.textContent = gpa.toFixed(2);
    if (academicStanding) academicStanding.textContent = getAcademicStanding(gpa);
    if (saveSemesterBtn) saveSemesterBtn.disabled = false;


    if (gpa >= 4.0) {
        if (gpaFeedback) gpaFeedback.textContent = "Excellent work! Keep setting high standards.";
        const confetti = document.getElementById('confetti-overlay');
        if (confetti) {
            confetti.classList.add('active');
            setTimeout(() => confetti.classList.remove('active'), 3000);
        }
    } else if (gpa >= 3.0) {
        if (gpaFeedback) gpaFeedback.textContent = "Solid semester! Look for opportunities to improve next time.";
    } else {
        if (gpaFeedback) gpaFeedback.textContent = "Focus on what went wrong and plan for a comeback!";

    }
    saveState();
}

function handleSaveSemester() {
    const { gpa, totalPoints, totalUnits } = calculateGPA(state.courses);
    if (totalUnits === 0) return alert("Cannot save an empty semester.");

    const semesterName = prompt("Enter a name for this semester (e.g., Spring 2024):", `Semester ${state.semesters.length + 1}`);
    if (!semesterName) return;

    state.semesters.push({
        name: semesterName,
        gpa: gpa,
        totalPoints: totalPoints,
        totalUnits: totalUnits,
        courses: [...state.courses]

    });

    state.courses = [];
    alert(`${semesterName} saved successfully!`);
    renderGPATable();
    renderCGPAHistory();
    renderOverview();
    saveState();
}

// --- CGPA CALCULATOR ---

function calculateCGPA() {
    let cumulativePoints = state.semesters.reduce((sum, s) => sum + s.totalPoints, 0);
    let cumulativeUnits = state.semesters.reduce((sum, s) => sum + s.totalUnits, 0);

    const cgpa = cumulativeUnits === 0 ? 0 : 

cumulativePoints / cumulativeUnits;
    return { cgpa, cumulativePoints, cumulativeUnits };
}

function renderCGPAHistory() {
    const list = document.getElementById('cgpa-semester-list');
    const calculateCgpaBtn = document.getElementById('calculate-cgpa-btn');
    
    if (!list) return;
    
    list.innerHTML = '';

    if (state.semesters.length === 0) {
        list.innerHTML = '<p class="no-data">No semesters saved yet. Use the GPA Calculator or manually enter results.</p>';

        if (calculateCgpaBtn) calculateCgpaBtn.disabled = true;
        return;
    }

    if (calculateCgpaBtn) calculateCgpaBtn.disabled = false;
    
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
    }
}


function handleManualSemesterAdd(e) {
    e.preventDefault();
    
    const name = document.getElementById('manual-sem-name').value.trim();
    const points = parseFloat(document.getElementById('manual-total-points').value);
    const units = parseInt(document.getElementById('manual-total-units').value);

    if (!name || isNaN(points) || isNaN(units) || units <= 0) {
        return alert("Please enter valid semester details.");
    }

    const gpa = units === 0 ? 0 : points / units;


    state.semesters.push({
        name: name,
        gpa: gpa,
        totalPoints: points,
        totalUnits: units,
        courses: []
    });

    closeModal('cgpa-manual-modal');
    e.target.reset();
    renderCGPAHistory();
    renderOverview();
    saveState();
    alert(`Manual semester "${name}" added successfully with GPA: ${gpa.toFixed(2)}.`);
}

// --- TIMETABLE ---

function convertTo12Hour(time) {
    let [h, m] = time.split(':').map(Number);

    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    m = m.toString().padStart(2, '0');
    return `${h}:${m} ${ampm}`;
}

function renderTimetable() {
    const tbody = document.getElementById('timetable-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    HOUR_SLOTS.forEach(hour => {
        const tr = document.createElement('tr');
        const timeCell = document.createElement('td');
        const timeString = `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
        timeCell.textContent = timeString;

        tr.appendChild(timeCell);

        DAYS_OF_WEEK.forEach(day => {
            const dayCell = document.createElement('td');
            const classes = state.timetable[day] || [];
            
            const classAtHour = classes.find(cls => {
                const timeParts = cls.time.match(/(\d+):(\d+) (AM|PM)/);
                if (!timeParts) return false;
                let h = parseInt(timeParts[1]);
                const meridiem = timeParts[3];

                if (meridiem === 'PM' && h !== 12) h += 12;
                if (meridiem === 'AM' && h === 12) h = 0;

                return h === hour;

            });

            if (classAtHour) {
                dayCell.innerHTML = `<div class="class-block" title="${classAtHour.subject} at ${classAtHour.time}">${classAtHour.code}</div>`;
                dayCell.classList.add('has-class');
                dayCell.addEventListener('click', () => {
                    if(confirm(`Remove class ${classAtHour.code} on ${day} at ${classAtHour.time}?`)) {
                        removeClass(day, classAtHour.code, classAtHour.time);
                    }
                });
            }
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
    state.timetable[day].sort((a, b) => a.time.localeCompare(b.time));
    e.target.reset();
    renderTimetable();
    saveState();
    renderOverview();
    alert(`${code} added to ${day}'s schedule.`);
}

function removeClass(day, code, time) {
    if (state.timetable[day]) {

        state.timetable[day] = state.timetable[day].filter(cls => 
            !(cls.code === code && cls.time === time)
        );
        if (state.timetable[day].length === 0) delete state.timetable[day];
        renderTimetable();
        saveState();
        renderOverview();
    }
}

// --- NOTES SECTION ---

const handleNoteEdit = (e) => {
    e.stopPropagation(); 
    openNoteEditor(e.currentTarget.dataset.id);
};

const handleNoteClick = (e) => {
    if (!e.target.closest('.note-edit-action')) {
        openNoteEditor(e.currentTarget.dataset.id);
    }
};

const renderNotesGrid = () => {
    const notesGrid = document.getElementById('notes-grid');
    if (!notesGrid) return;
    
    notesGrid.innerHTML = ''; 

    if (state.notes.length === 0) {
        notesGrid.innerHTML = '<p class="no-data" style="grid-column: 1 / -1;">No notes saved yet. Get organized!</p>';
        return;
    }

    state.notes.forEach(note => {

        const card = document.createElement('div');
        card.className = 'card note-card';
        card.dataset.id = note.id;
        
        const doc = new DOMParser().parseFromString(note.content, 'text/html');
        const textContent = doc.body.textContent || ""; 
        const preview = textContent.length > 100 ? textContent.substring(0, 100).trim() + '...' : textContent;

        card.innerHTML = `
            <h4>${note.title}</h4>
            <p>${preview}</p>
            <div class="note-actions">
                <small>Last edited: ${note.date}</small>
                <button class="btn btn-small btn-primary note-edit-action" data-id="$

{note.id}">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </div>
        `;
        notesGrid.appendChild(card);
    });

    document.querySelectorAll('.note-edit-action').forEach(button => {
        button.removeEventListener('click', handleNoteEdit); 
        button.addEventListener('click', handleNoteEdit);
    });
    
    document.querySelectorAll('.note-card').forEach(card => {
        card.removeEventListener('click', handleNoteClick); 
        card.addEventListener('click', handleNoteClick);

    });
};

const openNoteEditor = (noteId = null) => {
    const noteEditorModal = document.getElementById('note-editor-modal');
    const noteTitleInput = document.getElementById('note-title-input');
    const deleteNoteBtn = document.getElementById('delete-note-btn');
    
    // More lenient check - just verify quill exists as an object
    if (!quill || typeof quill.root === 'undefined') {
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

    if (noteId) {

        const note = state.notes.find(n => n.id === noteId);
        if (note) {
            const editorTitle = document.getElementById('editor-title');
            if (editorTitle) editorTitle.textContent = 'Edit';
            noteTitleInput.value = note.title;
            try {
                quill.root.innerHTML = note.content;
            } catch (error) {
                console.error('Error loading note content:', error);
            }
            if (deleteNoteBtn) deleteNoteBtn.style.display = 'inline-flex';
        } else {
            const editorTitle = document.getElementById('editor-title');
            if (editorTitle) editorTitle.textContent = 'Create';

            if (deleteNoteBtn) deleteNoteBtn.style.display = 'none';
            currentEditingNoteId = null; 
        }
    } else {
        const editorTitle = document.getElementById('editor-title');
        if (editorTitle) editorTitle.textContent = 'Create';
        if (deleteNoteBtn) deleteNoteBtn.style.display = 'none';
        currentEditingNoteId = null; 
    }
};

const saveNote = () => {
    const noteTitleInput = document.getElementById('note-title-input');
    const noteEditorModal = document.getElementById('note-editor-modal');

    if (!quill || !noteTitleInput || !noteEditorModal) return;

    const title = noteTitleInput.value.trim() || 'Untitled Note';
    const content = quill.root.innerHTML;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    if (content.trim() === '<p><br></p>' || content.trim() === '') {
        alert('Note content cannot be empty. Please write something!');
        return;
    }

    if (currentEditingNoteId) {
        const index = state.notes.findIndex(n => n.id === currentEditingNoteId);
        if (index !== -1) {
            state.notes[index] = { 

...state.notes[index], title, content, date };
        }
    } else {
        const newNote = {
            id: Date.now().toString(), 
            title,
            content,
            date
        };
        state.notes.unshift(newNote); 
    }

    saveState();
    renderNotesGrid(); 
    noteEditorModal.style.display = 'none'; 
    currentEditingNoteId = null; 
};

const deleteNote = () => {
    const noteEditorModal = document.getElementById('note-editor-modal');


    if (currentEditingNoteId && confirm('Are you sure you want to delete this note permanently?')) {
        state.notes = state.notes.filter(n => n.id !== currentEditingNoteId);
        saveState();
        renderNotesGrid();
        if (noteEditorModal) noteEditorModal.style.display = 'none';
        currentEditingNoteId = null;
    }
};

// --- EXAM COUNTDOWN ---

function renderExamList() {
    const container = document.getElementById('exam-list-container');
    if (!container) return;
    

    container.innerHTML = '';
    const now = new Date();
    
    const sortedExams = state.exams.map(exam => ({
        ...exam,
        dateObj: new Date(exam.date + "T00:00:00")
    })).filter(exam => exam.dateObj >= now || exam.dateObj.toDateString() === now.toDateString())
     .sort((a, b) => a.dateObj - b.dateObj);

    if (sortedExams.length === 0) {
        container.innerHTML = '<p class="no-data">No upcoming exams scheduled. Focus Mode awaits!</p>';
        return;
    }

    sortedExams.forEach(exam => {
        const diffTime = 

Math.abs(exam.dateObj - now);
        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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

    if (!name || !dateStr || date < new 

Date(new Date().toDateString())) {
        return alert("Please enter a valid exam name and a future date.");
    }

    state.exams.push({
        id: Date.now(),
        name: name,
        date: dateStr,
    });

    e.target.reset();
    renderExamList();
    saveState();
    renderOverview();
}

function removeExam(e) {
    const id = parseInt(e.currentTarget.getAttribute('data-id'));
    if (confirm("Are you sure you want to remove this exam?")) {
        state.exams = state.exams.filter(e => e.id !== id);
        renderExamList();
        renderOverview();
        saveState();
    }
}

// --- PROFILE & LOGOUT ---

function loadProfileData() {
    const fullNameInput = document.getElementById('full-name');
    const studentIdInput = document.getElementById('student-id');
    const majorInput = document.getElementById('major');
    const emailInput = document.getElementById('email');
    const currentSemesterInput = document.getElementById('current-semester');
    
    if (fullNameInput) fullNameInput.value = state.userName;
    if (studentIdInput) studentIdInput.value = state.studentId || "S00123456";
    if (majorInput) majorInput.value = state.major || "Computer Science";
    if (emailInput) emailInput.value = state.email || "user@university.edu";
    if (currentSemesterInput) currentSemesterInput.value = state.currentSemester || 1;
    
    const changePassBtn = document.getElementById('change-password-btn');
    const twoFactorBtn = document.getElementById('two-factor-btn');
    if (changePassBtn) changePassBtn.onclick = () => alert("Security Action: Redirecting to secure portal. (Mock)");
    if (twoFactorBtn) twoFactorBtn.onclick = () => alert("Security Action: Two-Factor Authentication settings. (Mock)");
}
function handleProfileUpdate(event) {
    event.preventDefault();
    
    const fullNameInput = document.getElementById('full-name');
    const studentIdInput = document.getElementById('student-id');
    const majorInput = document.getElementById('major');
    const emailInput = document.getElementById('email');
    const currentSemesterInput = document.getElementById('current-semester');
    
    if (!fullNameInput) return;
    
    // Save all profile fields to state
    const newName = fullNameInput.value.trim();
    const newMajor = majorInput ? majorInput.value.trim() : state.major || "Computer Science";
    const newSemester = currentSemesterInput ? parseInt(currentSemesterInput.value) : state.currentSemester || 1;
    const newStudentId = studentIdInput ? studentIdInput.value.trim() : state.studentId || "S00123456";
    const newEmail = emailInput ? emailInput.value.trim() : state.email || "user@university.edu";
    
    // Update state with all fields
    if (newName && newName !== state.userName) {
        updateUserNameDisplay(newName);
    }
    
    state.major = newMajor;
    state.currentSemester = newSemester;
    state.studentId = newStudentId;
    state.email = newEmail;
    
    saveState();
    
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
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('uniportalState'); 
        alert("Logged out successfully! The dashboard will reset.");
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
    if (profileInput) 

profileInput.addEventListener('change', handleAvatarChange);

    const loadAvatar = () => {
        const savedDataURL = localStorage.getItem(AVATAR_STORAGE_KEY);
        if (savedDataURL) {
            if (navImage) navImage.src = savedDataURL;
            if (profileImage) profileImage.src = savedDataURL;
        } 
    };
    loadAvatar();
    
    // Quill Editor - Initialize FIRST before anything else
    const editorContainer = document.getElementById('note-editor-container');
    

    if (editorContainer) {
        const toolbarOptions = [
            ['bold', 'italic', 'underline', 'strike'], 
            ['blockquote', 'code-block'],
            [{ 'header': 1 }, { 'header': 2 }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'indent': '-1'}, { 'indent': '+1' }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'color': [] }, { 'background': [] }],
            ['clean']
        ];

        try {
            quill = new Quill(editorContainer, {
                modules: { toolbar: toolbarOptions },
                theme: 'snow',
                placeholder: 'Start writing your lecture notes here...'
            });
            console.log('Quill editor initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Quill editor:', error);
            alert('Failed to load the note editor. Please refresh the page.');
        }
    } else {
        console.error('Note editor container not found in DOM');
    }

    // Setup
    setupThemeToggle();
    updateUserNameDisplay(state.userName);
    renderNotifications();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const targetSection = 

e.currentTarget.getAttribute('data-section');
            if (targetSection) {
                switchSection(targetSection);
            }
        });
    });

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

    // Notes - with slight delay to ensure Quill is ready
    const newNoteBtn = document.getElementById('new-note-btn');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const deleteNoteBtn = document.getElementById('delete-note-btn');

    const noteEditorModal = document.getElementById('note-editor-modal');

    if (newNoteBtn) {
        newNoteBtn.addEventListener('click', () => {
            // Small delay to ensure Quill is fully initialized
            setTimeout(() => openNoteEditor(null), 50);
        });
    }
    if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveNote);
    if (deleteNoteBtn) deleteNoteBtn.addEventListener('click', deleteNote);
    
    if (noteEditorModal) {
        noteEditorModal.addEventListener('click', 

(e) => {
            if (e.target === noteEditorModal) {
                closeModal('note-editor-modal');
            }
        });
    }

    // Share Modal
    const globalShareBtn = document.getElementById('globalShareBtn');
    const shareNotesModal = document.getElementById('shareNotesModal');
    const closeModalBtn = document.getElementById('closeModalBtn');

    if (globalShareBtn) { 
        globalShareBtn.addEventListener('click', () => {

            populateNoteList();
            openModal('shareNotesModal');
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            closeModal('shareNotesModal');
        });
    }

    if (shareNotesModal) {
        shareNotesModal.addEventListener('click', (e) => {
            if (e.target === shareNotesModal) {
                closeModal('shareNotesModal');
            }
        });
    }

    
    // Download Modal
    const globalDownloadBtn = document.getElementById('globalDownloadBtn');
    if (globalDownloadBtn) {
        globalDownloadBtn.addEventListener('click', () => {
            openDownloadModal('downloadNotesModal');
        });
    }

    const closeDownloadModalBtn = document.getElementById('closeDownloadModalBtn');
    if (closeDownloadModalBtn) {
        closeDownloadModalBtn.addEventListener('click', () => {

            closeModal('downloadNotesModal');
        });
    }
    
    const downloadNotesModal = document.getElementById('downloadNotesModal');
    if (downloadNotesModal) {
        downloadNotesModal.addEventListener('click', (e) => {
            if (e.target === downloadNotesModal) {
                closeModal('downloadNotesModal');
            }
        });
    }
    
    // Download from Editor
    const downloadNoteEditorBtn = document.getElementById('downloadNoteEditorBtn');
    if (downloadNoteEditorBtn) {
        downloadNoteEditorBtn.addEventListener('click', handleEditorDownload);
    }

    // Close buttons with data-modal-id
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.getAttribute('data-modal-id'); 
            
            if (!modalId) {
                const modalElement = e.target.closest('.modal');
                if (modalElement) {
                    closeModal(modalElement.id);
                }
            } else {
                closeModal(modalId);

            }
        });
    });

    // Loading Screen
    const body = document.body;
    const loadingOverlay = document.getElementById('loading-overlay');
    const mainAppContainer = document.getElementById('main-app-container');

    switchSection(state.currentSection);

    if (loadingOverlay && mainAppContainer) {
        body.classList.add('no-scroll');

        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            

mainAppContainer.classList.remove('main-content-hidden');
            mainAppContainer.classList.add('main-content-visible');
            
            setTimeout(() => {
                body.classList.remove('no-scroll');
            }, 600);
        }, 5000);
    }
// Mobile Hamburger Menu - FIXED VERSION
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
                sidebar.classList.remove('mobile-open');
            }
        };
        
        toggleMenuVisibility();

        
        // Toggle sidebar on click
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('mobile-open');
        });
        
        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('mobile-open') &&
                !sidebar.contains(e.target) && 
                e.target !== hamburger &&
                !hamburger.contains(e.target)) {
                sidebar.classList.remove('mobile-open');
            }

        });
        
        // Close sidebar when clicking a nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('mobile-open');
                }
            });
        });
        
        // Handle window resize
        window.addEventListener('resize', toggleMenuVisibility);
    };
    
    createMobileMenu();
// ============================================
    // NOTIFICATION SYSTEM INITIALIZATION
    // ============================================
    console.log('🚀 Initializing notification system...');
    
    // Request permission and start scheduling
    requestNotificationPermission().then(() => {
        scheduleNotificationChecks();
    });
    
    // Clear old notification flags daily
    const checkAndClearOldFlags = () => {
        const today = new Date().toDateString();
        const lastClearDate = localStorage.getItem('lastNotificationClear');
        
        if (lastClearDate !== today) {
            console.log('🧹 Clearing old notification flags...');
            
            // Clear old exam notification flags (keep only last 7 days)
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('exam_')) {
                    const dateStored = localStorage.getItem(key);
                    const daysDiff = Math.floor((new Date() - new Date(dateStored)) / (1000 * 60 * 60 * 24));
                    if (daysDiff > 7) {
                        localStorage.removeItem(key);
                    }
                }
            });
            
            localStorage.setItem('lastNotificationClear', today);
        }
    };
    checkAndClearOldFlags();
    
    // Add test buttons (remove after confirming it works)
    const testButtonsContainer = document.createElement('div');
    testButtonsContainer.style.cssText = 'position: fixed; bottom: 20px; left: 20px; z-index: 9999; display: flex; gap: 10px; flex-direction: column;';
    /*testButtonsContainer.innerHTML = `
        <button onclick="testNotification()" class="btn btn-primary" style="font-size: 0.85rem; padding: 8px 12px;">
            🧪 Test Notification
        </button>
        <button onclick="testClassReminder()" class="btn btn-accent" style="font-size: 0.85rem; padding: 8px 12px;">
            ⏰ Test Class Reminder
        </button>
        <button onclick="runNotificationChecks()" class="btn btn-secondary" style="font-size: 0.85rem; padding: 8px 12px;">
            🔄 Check Now
        </button>
    `;
    document.body.appendChild(testButtonsContainer);
    
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
            alert('Data imported successfully! Refreshing...');
            window.location.reload();

        } catch (error) {
            alert('Invalid backup file!');
        }
    };
    reader.readAsText(file);
}



