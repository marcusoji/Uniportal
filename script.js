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
function createNoteFile(note, format = 'txt') {
    if (!note || !note.content) return null;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = note.content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    const fileNameBase = note.title.replace(/[^a-zA-Z0-9]/g, '_') || 'UniPortal_Note';
    
    let fileContent;
    let fileMimeType;
    let fileName;
    
    if (format === 'html') {
        fileContent = `<!DOCTYPE html><html><head><title>${note.title}</title></head><body><h1>${note.title}</h1><div>${note.content}</div></body></html>`;
        fileMimeType = 'text/html';
        fileName = `${fileNameBase}.html`;
    } else if (format === 'json') {
        fileContent = JSON.stringify(note, null, 2);
        fileMimeType = 'application/json';
        fileName = `${fileNameBase}.json`;
    } else { // default to txt
        fileContent = 
            `UniPortal Note: ${note.title}\n` +
            `Date: ${note.date || new Date().toLocaleDateString()}\n` +
            `----------------------------------------\n\n` +
            plainText;
        fileMimeType = 'text/plain';
        fileName = `${fileNameBase}.txt`;
    }

    const blob = new Blob([fileContent], { type: fileMimeType });
    return new File([blob], fileName, { type: fileMimeType });
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
    // Create a plain text version for the share data text body
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = note.content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    const preview = plainText.length > 150 
        ? plainText.substring(0, 150).trim() + '...' 
        : plainText;
    
    // Create a file object for file sharing
    const singleNoteFile = createNoteFile(note, 'txt'); 
    
    if (!singleNoteFile) {
        alert("Failed to create file for sharing.");
        return;
    }
    
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
                    alert("Sharing failed and clipboard access denied.");
                }
            }
        }
    }
}


function setupDownloadGlobalModal() {
    const downloadModal = document.getElementById('downloadNotesModal');
    const downloadListContainer = document.getElementById('downloadListContainer');
    const closeDownloadModalBtn = document.getElementById('closeDownloadModalBtn');
    const globalDownloadBtn = document.getElementById('globalDownloadBtn');
    
    if (!downloadModal || !downloadListContainer || !globalDownloadBtn) return;
    
    globalDownloadBtn.addEventListener('click', () => {
        renderDownloadList();
        openModal('downloadNotesModal');
    });

    closeDownloadModalBtn.addEventListener('click', () => closeModal('downloadNotesModal'));
    
    function renderDownloadList() {
        downloadListContainer.innerHTML = '';
        if (state.notes.length === 0) {
            downloadListContainer.innerHTML = '<p class="no-data">No notes to download.</p>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'download-note-list';

        state.notes.forEach(note => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${note.title}</span>
                <div class="download-actions">
                    <button class="btn btn-small btn-primary" data-id="${note.id}" data-format="txt">TXT</button>
                    <button class="btn btn-small btn-accent" data-id="${note.id}" data-format="html">HTML</button>
                    <button class="btn btn-small btn-secondary" data-id="${note.id}" data-format="json">JSON</button>
                </div>
            `;
            
            // Add event listeners to the download buttons
            li.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const noteId = e.target.getAttribute('data-id');
                    const format = e.target.getAttribute('data-format');
                    const noteToDownload = state.notes.find(n => n.id === noteId);
                    
                    if (noteToDownload) {
                        handleDownloadFromGlobalModal(noteToDownload, format);
                    }
                });
            });
            
            ul.appendChild(li);
        });
        downloadListContainer.appendChild(ul);
    }
}

function handleDownloadFromGlobalModal(note, format) {
    const noteFile = createNoteFile(note, format);
    if (noteFile) {
        executeDownload(noteFile);
        console.log(`Download initiated for: ${note.title} in ${format} format`);
    }
}

function setupShareGlobalModal() {
    const shareModal = document.getElementById('shareNotesModal');
    const noteListContainer = document.getElementById('noteListContainer');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const globalShareBtn = document.getElementById('globalShareBtn');

    if (!shareModal || !noteListContainer || !globalShareBtn) return;

    globalShareBtn.addEventListener('click', () => {
        renderShareList();
        openModal('shareNotesModal');
    });

    closeModalBtn.addEventListener('click', () => closeModal('shareNotesModal'));

    function renderShareList() {
        noteListContainer.innerHTML = '';
        if (state.notes.length === 0) {
            noteListContainer.innerHTML = '<p class="no-data">No notes available for sharing.</p>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'note-list';

        state.notes.forEach(note => {
            const li = document.createElement('li');
            li.textContent = note.title;
            li.setAttribute('data-id', note.id);
            li.style.cursor = 'pointer';
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid var(--color-border)';
            li.addEventListener('click', (e) => {
                const noteId = e.target.getAttribute('data-id');
                const noteToShare = state.notes.find(n => n.id === noteId);
                if (noteToShare) {
                    executeShare(noteToShare);
                }
            });
            ul.appendChild(li);
        });
        noteListContainer.appendChild(ul);
    }
}

// Downloads the currently open note from the editor
function downloadCurrentNoteFromEditor(format = 'txt') {
    const title = document.getElementById('note-title-input')?.value.trim() || 'Untitled Note'; // FIX: updated ID from note-title
    const content = quill.root.innerHTML;
    
    if (!content || content.trim() === '') {
        alert("Note content is empty. Nothing to download.");
        return;
    }
    
    // Create a temporary note object for file creation utility
    const tempNote = {
        title: title,
        content: content,
        date: state.notes.find(n => n.id === currentEditingNoteId)?.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        id: currentEditingNoteId || Date.now().toString()
    };
    
    const noteFile = createNoteFile(tempNote, format);
    if (noteFile) {
        executeDownload(noteFile);
        console.log(`Download initiated for: ${title}`);
    }
}

// --- CONSTANTS & STATE ---
const GRADE_POINTS = { 
    'A': 5.0, 
    'B': 4.0, 
    'C': 3.0, 
    'D': 2.0, 
    'E': 1.0, 
    'F': 0.0 
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
        email: "user@university.edu",
        currentSemester: 1,
        courses: [], // Current semester courses
        semesters: [], // Past semesters (for CGPA)
        timetable: {}, // Weekly schedule
        notes: [], // User notes
        exams: [], // Exam countdowns
        notifications: [], // In-app notifications
        isFocusMode: false,
        theme: 'light'
    };
}

let state = getInitialState();
let quill = null;
let currentEditingNoteId = null;
let gpaChart = null;

// IndexedDB setup (simplified integration as per previous steps)
let db;
const DB_NAME = 'UniPortalDB';
const DB_VERSION = 11; // Must be incremented when object stores change

function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Create object stores if they don't exist
            if (!db.objectStoreNames.contains('state')) {
                db.createObjectStore('state', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('notes')) {
                const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
                notesStore.createIndex('title', 'title', { unique: false });
            }
            if (!db.objectStoreNames.contains('avatars')) {
                db.createObjectStore('avatars', { keyPath: 'id' });
            }
            console.log(`🔄 Database upgrade to version ${DB_VERSION} complete`);
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            console.log('✅ IndexedDB opened successfully (version 11)');
            resolve(db);
        };

        request.onerror = (e) => {
            console.error('❌ IndexedDB error:', e.target.error);
            reject(e.target.error);
        };
    });
}

async function loadStateFromIndexedDB() {
    try {
        console.log('🔄 Checking for localStorage migration...');
        const hasLocalStorageData = localStorage.getItem('uniportalState') !== null;
        
        const tx = db.transaction('state', 'readonly');
        const store = tx.objectStore('state');
        const dbState = await new Promise((resolve, reject) => {
            const getRequest = store.get('current');
            getRequest.onsuccess = (e) => {
                resolve(e.target.result);
            };
            // Explicit error handler for the request
            getRequest.onerror = (e) => {
                reject(e.target.error || new Error('IndexedDB GET request failed with no explicit error.'));
            };
        });

        if (dbState) {
             console.log('✅ IndexedDB already has data, skipping migration');
            state = dbState.data;
        } else if (hasLocalStorageData) {
             console.log('⚠️ LocalStorage data found, migrating to IndexedDB...');
            state = JSON.parse(localStorage.getItem('uniportalState'));
            await saveState(); // Save to IndexedDB
            localStorage.removeItem('uniportalState'); // Clean up old storage
        }
        
        console.log('✅ State loaded from IndexedDB');
        // Initial setup calls
        updateUserNameDisplay(state.userName);
        switchSection(getCurrentSectionHash());
        applyTheme(state.theme);
        renderNotifications();
        renderExamList(); // Ensure exam list is rendered for countdown
        
    } catch (error) {
        console.error('❌ Error loading state from IndexedDB:', error);
        
        // --- IMPROVED ERROR FEEDBACK ---
        console.warn('⚠️ A critical IndexedDB error occurred, potentially due to corrupted stored data. Falling back to default state.');
        alert('Data loading failed due to a browser storage error. Your data may be corrupted. You may need to clear your browser storage (Application > IndexedDB > UniPortalDB in Developer Tools) and reload for a clean start.');
        // -------------------------------
        
        // Fallback to initial state if DB fails
        state = getInitialState(); 
        updateUserNameDisplay(state.userName);
        applyTheme(state.theme);
        switchSection('overview');
    }
}


function saveState() {
    const tx = db.transaction('state', 'readwrite');
    const store = tx.objectStore('state');
    
    // Ensure all required properties are present
    const stateToSave = {
        id: 'current',
        data: {
            userName: state.userName,
            studentId: state.studentId,
            major: state.major,
            email: state.email,
            currentSemester: state.currentSemester,
            courses: state.courses || [],
            semesters: state.semesters || [],
            timetable: state.timetable || {},
            notes: state.notes || [],
            exams: state.exams || [],
            notifications: state.notifications || [],
            isFocusMode: state.isFocusMode,
            theme: state.theme
        }
    };

    store.put(stateToSave);

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            console.log('💾 State saved to IndexedDB');
            resolve();
        };
        tx.onerror = () => {
            console.error('❌ State save error:', tx.error);
            reject(tx.error);
        };
    });
}

// --- SECTION SWITCHING ---

function getCurrentSectionHash() {
    const hash = window.location.hash.substring(1);
    // Use 'overview' as default if hash is empty or invalid
    return hash || 'overview';
}

function switchSection(targetSectionId) {
    if (state.isFocusMode && targetSectionId !== 'countdown') { 
        alert('You are in Focus Mode! Please toggle it off to switch to other sections.');
        return;
    }
    
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(targetSectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        console.error(`Section ID not found: ${targetSectionId}. Switching to overview.`);
        document.getElementById('overview')?.classList.add('active');
        window.location.hash = 'overview';
        targetSectionId = 'overview';
    }

    // Update sidebar active link
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
        link.classList.remove('active');
    });
    
    // Select the link that has the matching data-section attribute
    const activeLink = document.querySelector(`.nav-item[data-section="${targetSectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    // Call the appropriate render function
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

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const newTheme = body.classList.contains('dark-theme') ? 'light' : 'dark';
            applyTheme(newTheme);
            state.theme = newTheme;
            saveState();
        });
    }
}

function applyTheme(theme) {
    const body = document.body;
    const icon = document.querySelector('#theme-toggle i');
    
    body.classList.remove('light-theme', 'dark-theme');
    body.classList.add(`${theme}-theme`);
    
    if (icon) {
        icon.classList.remove('fa-sun', 'fa-moon');
        icon.classList.add(theme === 'dark' ? 'fa-sun' : 'fa-moon');
    }
    // Re-render chart to pick up new theme colors
    if (gpaChart) {
        renderCGPAChart(state.semesters);
    }
}


// --- NOTIFICATIONS RENDERING ---

function renderNotifications() {
    const notificationList = document.getElementById('notification-list'); // FIX: changed from notification-log-list
    const notificationBadge = document.getElementById('notification-badge'); // FIX: changed from notification-count
    const noNotificationsMessage = document.querySelector('#notification-dropdown .no-notifications');
    
    if (!notificationList || !notificationBadge) return;
    
    notificationList.innerHTML = '';
    
    if (state.notifications.length === 0) {
        noNotificationsMessage.style.display = 'block';
        notificationBadge.classList.add('hidden');
        notificationBadge.textContent = 0;
        return;
    }
    
    noNotificationsMessage.style.display = 'none';
    notificationBadge.classList.remove('hidden');
    notificationBadge.textContent = state.notifications.length;
    
    state.notifications.forEach(notif => {
        const li = document.createElement('li');
        li.innerHTML = `
            <i class="fas fa-circle-info"></i>
            <div>
                <p>${notif.message}</p>
                <small>${notif.time}</small>
            </div>
        `;
        notificationList.appendChild(li);
    });
}

function setupNotificationListeners() {
    const bell = document.getElementById('notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    const clearBtn = document.getElementById('clear-notifications-btn');
    
    if (bell && dropdown) {
        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (state.notifications.length > 0) {
                state.notifications = [];
                saveState();
                renderNotifications();
                clearBtn.textContent = 'Cleared All';
                setTimeout(() => {
                    clearBtn.textContent = 'Clear';
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

    // Core Overview elements (IDs match)
    const totalCoursesCount = document.getElementById('total-courses-count');
    const currentGpaDisplay = document.getElementById('current-gpa-display');
    const cumulativeCgpaDisplay = document.getElementById('cumulative-cgpa-display');
    
    // Updated IDs for the Overview cards based on user's HTML
    const upcomingClassDisplay = document.getElementById('upcoming-class-display'); // FIX: changed from nextClassDisplay
    const daysToExamDisplay = document.getElementById('days-to-exam-display'); // FIX: changed from nextExamDisplay
    
    // Elements not present in the new HTML, check for them and skip if missing
    const timeUntilClass = document.getElementById('time-until-class'); 
    const examCountdown = document.getElementById('exam-countdown');
    const academicStandingDisplay = document.getElementById('academic-standing-display');
    

    // Initial check to avoid the "DOM elements missing" error for the main IDs
    if (!totalCoursesCount || !currentGpaDisplay || !cumulativeCgpaDisplay || !upcomingClassDisplay || !daysToExamDisplay) {
        console.warn('⚠️ Overview DOM elements missing or mismatched in the HTML structure. Cannot render overview content.');
        return; 
    }
    
    // 1. GPA/CGPA Summary
    if (totalCoursesCount) totalCoursesCount.textContent = state.courses.length;
    if (currentGpaDisplay) currentGpaDisplay.textContent = state.courses.length > 0 ? currentGpa.toFixed(2) : 'N/A';
    if (cumulativeCgpaDisplay) cumulativeCgpaDisplay.textContent = state.semesters.length > 0 ? cumulativeCgpa.toFixed(2) : 'N/A';
    if (academicStandingDisplay) academicStandingDisplay.textContent = `Academic Standing: ${getAcademicStanding(cumulativeCgpa)}`;

    // 2. Upcoming Class Logic
    const today = now.toLocaleString('en-us', { weekday: 'long' });
    const todayClasses = state.timetable[today] || [];
    let nextClass = null;
    let timeUntil = Infinity;
    
    // Convert current time to minutes
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Find the next class for today
    todayClasses.forEach(classItem => {
        const classTimeMinutes = parseTimeToMinutes(classItem.time);
        if (classTimeMinutes !== null) {
            const minutesUntilClass = classTimeMinutes - nowMinutes;
            
            // Only consider classes that haven't passed (or are just starting/passed a few minutes ago)
            if (minutesUntilClass >= -10 && minutesUntilClass < timeUntil) {
                timeUntil = minutesUntilClass;
                nextClass = classItem;
            }
        }
    });

    if (upcomingClassDisplay) {
        if (nextClass) {
            // Display: CourseCode (Time) - e.g., MTH 201 (9:00 AM)
            upcomingClassDisplay.textContent = `${nextClass.code} at ${nextClass.time}`;
        } else {
            upcomingClassDisplay.textContent = 'Nothing Today';
        }
    }
    if (timeUntilClass) {
        timeUntilClass.textContent = nextClass ? `(${timeUntil} min)` : '--';
    }
    
    // 3. Days to Next Exam Logic
    let nextExam = null;
    let minDaysUntil = Infinity;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    if (state.exams && state.exams.length > 0) {
        state.exams.forEach(exam => {
            const examDate = new Date(exam.date + "T00:00:00");
            const diffTime = examDate - todayDate;
            const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Only consider exams in the future or today (daysUntil >= 0)
            if (daysUntil >= 0 && daysUntil < minDaysUntil) {
                minDaysUntil = daysUntil;
                nextExam = exam;
            }
        });
    }

    if (daysToExamDisplay) {
        if (nextExam) {
            daysToExamDisplay.textContent = nextExam.name;
        } else {
            daysToExamDisplay.textContent = 'N/A';
        }
    }
    if (examCountdown) {
        if (nextExam) {
            if (minDaysUntil === 0) {
                examCountdown.textContent = 'TODAY!';
            } else if (minDaysUntil === 1) {
                examCountdown.textContent = 'TOMORROW!';
            } else {
                examCountdown.textContent = `${minDaysUntil} Days`;
            }
        } else {
            examCountdown.textContent = '--';
        }
    }
}

// Helper to convert 24hr time (HH:MM) to 12hr (H:MM AM/PM)
function convertTo12Hour(time24) {
    if (!time24) return '';
    let [h, m] = time24.split(':');
    h = parseInt(h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${m} ${ampm}`;
}

// --- GPA CALCULATOR ---

function calculateGPA(courses) {
    if (courses.length === 0) return { gpa: 0, totalPoints: 0, totalUnits: 0 };

    let totalPoints = 0;
    let totalUnits = 0;

    courses.forEach(course => {
        const units = parseInt(course.units);
        const grade = course.grade.toUpperCase();
        
        if (!isNaN(units) && units > 0 && GRADE_POINTS.hasOwnProperty(grade)) {
            totalPoints += units * GRADE_POINTS[grade];
            totalUnits += units;
        }
    });

    const gpa = totalUnits > 0 ? totalPoints / totalUnits : 0;
    return { gpa, totalPoints, totalUnits };
}

function getAcademicStanding(gpa) {
    if (gpa >= 4.5) return 'First Class Honours 🌟';
    if (gpa >= 3.5) return 'Second Class Honours (Upper Division) ⬆️';
    if (gpa >= 2.4) return 'Second Class Honours (Lower Division) ⬇️';
    if (gpa >= 1.5) return 'Third Class Honours 🥉';
    if (gpa >= 1.0) return 'Pass';
    return 'Probation/Fail';
}

function renderGPATable() {
    const tableBody = document.getElementById('gpa-course-list'); // FIX: changed from gpa-courses-body
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (state.courses.length === 0) {
        handleAddCourse(); // Add an initial empty row
        return;
    }
    
    state.courses.forEach((course, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" data-field="code" data-index="${index}" value="${course.code || ''}" placeholder="MTH 101" class="course-input code-input"></td>
            <td><input type="text" data-field="subject" data-index="${index}" value="${course.subject || ''}" placeholder="Calculus" class="course-input subject-input"></td>
            <td><input type="number" data-field="units" data-index="${index}" value="${course.units || ''}" min="1" max="6" placeholder="3" class="course-input units-input"></td>
            <td>
                <select data-field="grade" data-index="${index}" class="course-input grade-select">
                    <option value="">--</option>
                    ${Object.keys(GRADE_POINTS).map(grade => `
                        <option value="${grade}" ${course.grade?.toUpperCase() === grade ? 'selected' : ''}>${grade}</option>
                    `).join('')}
                </select>
            </td>
            <td class="calculated-points">${
                (course.units && course.grade && GRADE_POINTS[course.grade.toUpperCase()])
                ? (course.units * GRADE_POINTS[course.grade.toUpperCase()]).toFixed(1)
                : '0.0'
            }</td>
            <td><button class="btn btn-danger btn-small remove-course-btn" data-index="${index}"><i class="fas fa-trash"></i></button></td>
        `;
        tableBody.appendChild(row);
    });
    
    // Add event listeners for all input fields and the remove button
    tableBody.querySelectorAll('.course-input').forEach(input => {
        input.addEventListener('change', updateCourseData);
        input.addEventListener('keyup', updateCourseData);
    });
    tableBody.querySelectorAll('.remove-course-btn').forEach(button => {
        button.addEventListener('click', removeCourse);
    });
    
    handleCalculateGPA(); // Recalculate and render results after rendering table
}


function handleAddCourse() {
    state.courses.push({ code: '', subject: '', units: null, grade: '' });
    renderGPATable();
    
    // Scroll to the new row
    const tableBody = document.getElementById('gpa-course-list'); // FIX: changed from gpa-courses-body
    if (tableBody) {
        tableBody.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
}

function updateCourseData(e) {
    const index = parseInt(e.target.getAttribute('data-index'));
    const field = e.target.getAttribute('data-field');
    
    let value = e.target.value;
    if (field === 'units') {
        value = parseInt(e.target.value) || null;
    } else if (field === 'grade') {
        value = value.toUpperCase();
    }
    
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
    
    // Also update the points column in the table if it exists
    const tableBody = document.getElementById('gpa-course-list'); // FIX: changed from gpa-courses-body
    if (tableBody) {
        tableBody.querySelectorAll('tr').forEach((row, index) => {
            const course = state.courses[index];
            const pointsCell = row.querySelector('.calculated-points');
            if (pointsCell && course) {
                const units = parseInt(course.units);
                const grade = course.grade?.toUpperCase();
                const points = (units && grade && GRADE_POINTS[grade]) 
                    ? (units * GRADE_POINTS[grade]).toFixed(1)
                    : '0.0';
                pointsCell.textContent = points;
            }
        });
    }

    if (totalUnits === 0) {
        if (gpaFeedback) gpaFeedback.textContent = "Add courses and units to calculate your GPA.";
        if (gpaResult) gpaResult.textContent = 'N/A';
        if (academicStanding) academicStanding.textContent = 'Pending';
        if (saveSemesterBtn) saveSemesterBtn.disabled = true;
        return;
    }
    
    if (gpaResult) gpaResult.textContent = gpa.toFixed(2);
    const standing = getAcademicStanding(gpa);
    if (academicStanding) academicStanding.textContent = standing;
    
    if (gpaFeedback) {
        if (gpa >= 4.5) gpaFeedback.textContent = "Outstanding work! Keep up the First Class performance! 🚀";
        else if (gpa >= 3.5) gpaFeedback.textContent = "Excellent job! You're on track for an Upper Division degree.";
        else if (gpa >= 2.4) gpaFeedback.textContent = "Good progress! Focus on boosting that GPA next semester.";
        else gpaFeedback.textContent = "It's time to create a study plan. You can do better! 💪";
    }
    
    if (saveSemesterBtn) saveSemesterBtn.disabled = false;

    // Update the Overview page summary
    renderOverview();
}

function handleSaveSemester() {
    const { gpa, totalPoints, totalUnits } = calculateGPA(state.courses);
    
    if (totalUnits === 0 || state.courses.length === 0) {
        alert("Cannot save an empty semester. Add courses and calculate your GPA first.");
        return;
    }
    
    const semesterName = `Semester ${state.currentSemester}`;
    
    const newSemester = {
        id: Date.now().toString(),
        name: semesterName,
        gpa: gpa,
        totalPoints: totalPoints,
        totalUnits: totalUnits,
        courses: [...state.courses] // Save a copy of the courses
    };
    
    state.semesters.push(newSemester);
    state.currentSemester += 1; // Increment semester counter
    state.courses = []; // Clear current courses
    
    saveState();
    renderGPATable(); // Re-render the GPA table
    renderCGPAHistory(); // Re-render CGPA history
    renderOverview(); // Update overview
    
    // Confetti effect!
    const confettiOverlay = document.getElementById('confetti-overlay');
    if (confettiOverlay) {
        confettiOverlay.style.display = 'block';
        setTimeout(() => {
            confettiOverlay.style.display = 'none';
        }, 3000);
    }
    
    alert(`✅ ${semesterName} saved successfully! Current CGPA updated.`);
}


// --- CGPA CALCULATOR ---

function calculateCGPA() {
    let cumulativePoints = 0;
    let cumulativeUnits = 0;
    
    state.semesters.forEach(sem => {
        cumulativePoints += sem.totalPoints;
        cumulativeUnits += sem.totalUnits;
    });
    
    const cgpa = cumulativeUnits > 0 ? cumulativePoints / cumulativeUnits : 0;
    return { cgpa, cumulativePoints, cumulativeUnits };
}

function renderCGPAHistory() {
    const list = document.getElementById('cgpa-semester-list');
    if (!list) return;
    
    const { cgpa, cumulativeUnits } = calculateCGPA();
    const cgpaResultDisplay = document.getElementById('cgpa-result-display');
    const cgpaTotalUnits = document.getElementById('cgpa-total-units');
    const cgpaAcademicStanding = document.getElementById('cgpa-academic-standing');
    const progressCircle = document.getElementById('cgpa-progress-circle');

    list.innerHTML = '';
    
    if (state.semesters.length === 0) {
        list.innerHTML = '<p class="no-data">No semesters saved yet. Calculate and save a GPA first.</p>';
    }

    // Update CGPA summary card (if elements exist in this section)
    if (cgpaResultDisplay) cgpaResultDisplay.textContent = cgpa.toFixed(2);
    if (cgpaTotalUnits) cgpaTotalUnits.textContent = cumulativeUnits;
    if (cgpaAcademicStanding) cgpaAcademicStanding.textContent = getAcademicStanding(cgpa);
    
    if (progressCircle) {
        let color = '#ccc';
        if (cgpa >= 4.5) color = '#22c55e'; // Green - First Class
        else if (cgpa >= 3.5) color = '#f59e0b'; // Amber - Upper
        else if (cgpa >= 2.4) color = '#3b82f6'; // Blue - Lower
        
        const percentage = (cgpa / 5.0) * 100;
        progressCircle.style.background = `conic-gradient(${color} ${percentage}%, #eee ${percentage}%)`;
    }
    
    // Render semester cards
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
}

function removeSemester(e) {
    const index = parseInt(e.currentTarget.getAttribute('data-index'));
    state.semesters.splice(index, 1);
    saveState();
    renderCGPAHistory();
    renderOverview();
    alert("Semester removed. CGPA recalculated.");
}

function handleManualSemesterAdd(e) {
    e.preventDefault();
    const nameInput = document.getElementById('manual-sem-name');
    const pointsInput = document.getElementById('manual-total-points');
    const unitsInput = document.getElementById('manual-total-units');

    const name = nameInput.value.trim();
    const totalPoints = parseFloat(pointsInput.value);
    const totalUnits = parseInt(unitsInput.value);

    if (totalUnits <= 0) {
        alert("Total Units must be greater than zero.");
        return;
    }
    
    if (totalPoints < 0 || totalPoints > totalUnits * 5) {
        alert("Total Points seem invalid for the number of units (max 5.0 per unit).");
        return;
    }

    const gpa = totalPoints / totalUnits;

    const newSemester = {
        id: Date.now().toString(),
        name: `${name} (Manual)`,
        gpa: gpa,
        totalPoints: totalPoints,
        totalUnits: totalUnits,
        courses: []
    };

    state.semesters.push(newSemester);
    saveState();
    renderCGPAHistory();
    renderOverview();
    closeModal('cgpa-manual-modal');
    alert(`Manual semester "${name}" added successfully! GPA: ${gpa.toFixed(2)}`);
}

// --- TIMETABLE ---

function renderTimetable() {
    const tbody = document.getElementById('timetable-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Group classes by time slot
    const timeSlots = {};
    DAYS_OF_WEEK.forEach(day => {
        const classes = state.timetable[day] || [];
        classes.forEach(cls => {
            if (!timeSlots[cls.time]) {
                timeSlots[cls.time] = {};
            }
            timeSlots[cls.time][day] = cls;
        });
    });

    // Sort time slots
    const sortedTimes = Object.keys(timeSlots).sort((a, b) => {
        return parseTimeToMinutes(a) - parseTimeToMinutes(b);
    });

    if (sortedTimes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${DAYS_OF_WEEK.length + 1}" class="no-data-cell">No classes scheduled.</td></tr>`;
        return;
    }

    sortedTimes.forEach(time => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<th>${time}</th>`;
        
        DAYS_OF_WEEK.forEach(day => {
            const cls = timeSlots[time][day];
            const dayCell = document.createElement('td');
            dayCell.className = 'timetable-cell';
            
            if (cls) {
                dayCell.classList.add('has-class');
                dayCell.innerHTML = `
                    <div class="class-info">
                        <strong>${cls.code}</strong>
                        <small>${cls.subject}</small>
                        <button class="btn btn-danger btn-small remove-class-btn" 
                                data-day="${day}" 
                                data-time="${cls.time}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            } else {
                dayCell.innerHTML = '';
            }
            
            tr.appendChild(dayCell);
        });
        tbody.appendChild(tr);
    });
    
    tbody.querySelectorAll('.remove-class-btn').forEach(btn => {
        btn.addEventListener('click', removeClass);
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
    
    // Check for existing class at the same time slot
    const existingIndex = state.timetable[day].findIndex(cls => cls.time === time12);
    
    if (existingIndex !== -1) {
        if (!confirm(`A class (${state.timetable[day][existingIndex].code}) is already scheduled for ${time12} on ${day}. Do you want to replace it?`)) {
            return;
        }
        state.timetable[day].splice(existingIndex, 1, newClass); // Replace existing
        alert(`Class updated: ${code} on ${day} at ${time12}`);
    } else {
        state.timetable[day].push(newClass);
        alert(`Class added: ${code} on ${day} at ${time12}`);
    }

    // Sort classes by time
    state.timetable[day].sort((a, b) => {
        return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });

    saveState();
    renderTimetable();
    renderOverview();
    
    // Clear form
    document.getElementById('add-class-form').reset();
}

function removeClass(e) {
    const day = e.currentTarget.getAttribute('data-day');
    const time = e.currentTarget.getAttribute('data-time');
    
    if (state.timetable[day]) {
        const initialLength = state.timetable[day].length;
        state.timetable[day] = state.timetable[day].filter(cls => cls.time !== time);
        
        if (state.timetable[day].length < initialLength) {
            saveState();
            renderTimetable();
            renderOverview();
            alert(`Class removed from ${day} at ${time}.`);
        }
    }
}

// --- NOTES SECTION ---

function initializeQuill() {
    const editorContainer = document.getElementById('note-editor-container');
    if (editorContainer && !quill) {
        quill = new Quill(editorContainer, {
            theme: 'snow',
            placeholder: 'Start writing your lecture notes here...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'color': [] }, { 'background': [] }],
                    ['link', 'blockquote', 'code-block'],
                    ['clean']
                ]
            }
        });
        console.log('✅ Quill editor initialized.');
    } else if (quill) {
        console.log('⚠️ Quill editor already initialized.');
    }
}

function openNoteEditor(noteId = null) {
    if (!quill) {
        console.error('Quill editor not initialized:', quill);
        alert("The note editor failed to load. Please refresh the page and try again.");
        return;
    }
    
    const noteEditorModal = document.getElementById('note-editor-modal');
    const noteTitleInput = document.getElementById('note-title-input'); // FIX: updated ID from note-title-input
    const deleteNoteBtn = document.getElementById('delete-note-btn');

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
    
    if (deleteNoteBtn) deleteNoteBtn.style.display = 'none';

    if (noteId) {
        const note = state.notes.find(n => n.id === noteId);
        if (note) {
            const editorTitle = document.getElementById('editor-title');
            if (editorTitle) editorTitle.textContent = 'Edit Note';
            noteTitleInput.value = note.title;
            try {
                quill.root.innerHTML = note.content;
            } catch (error) {
                console.error('Error loading note content:', error);
            }
            if (deleteNoteBtn) deleteNoteBtn.style.display = 'inline-flex';
        } else {
            const editorTitle = document.getElementById('editor-title');
            if (editorTitle) editorTitle.textContent = 'Create Note';
        }
    } else {
        const editorTitle = document.getElementById('editor-title');
        if (editorTitle) editorTitle.textContent = 'Create Note';
    }
}

function renderNotesGrid() {
    const notesContainer = document.getElementById('notes-grid');
    if (!notesContainer) return;
    
    notesContainer.innerHTML = '';
    notesContainer.className = 'notes-grid'; // Ensure correct class
    
    if (state.notes.length === 0) {
        notesContainer.innerHTML = '<p class="no-data">No notes created yet. Click "Create New Note" to begin!</p>';
        return;
    }
    
    state.notes.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by newest first
    
    state.notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.setAttribute('data-id', note.id);
        
        // Strip HTML for a snippet preview
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content;
        const snippet = tempDiv.textContent.length > 100 
            ? tempDiv.textContent.substring(0, 100).trim() + '...' 
            : tempDiv.textContent;
        
        card.innerHTML = `
            <h3>${note.title}</h3>
            <p class="snippet">${snippet || 'No content preview.'}</p>
            <small>Last edited: ${note.date}</small>
            <button class="btn btn-primary btn-small view-note-btn"><i class="fas fa-eye"></i> View</button>
        `;
        
        card.querySelector('.view-note-btn').addEventListener('click', () => {
            openNoteEditor(note.id);
        });

        notesContainer.appendChild(card);
    });
}

function handleSaveNote() {
    if (!quill) return;
    
    const title = document.getElementById('note-title-input').value.trim(); // FIX: updated ID from note-title-input
    const content = quill.root.innerHTML;
    
    if (!title || content.trim() === '') {
        alert("Please provide a title and note content.");
        return;
    }
    
    const newNote = {
        id: currentEditingNoteId || Date.now().toString(),
        title: title,
        content: content,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    };
    
    if (currentEditingNoteId) {
        // Update existing note
        const index = state.notes.findIndex(n => n.id === currentEditingNoteId);
        if (index !== -1) {
            state.notes[index] = newNote;
        }
        alert(`Note "${newNote.title}" updated.`);
    } else {
        // Save new note
        state.notes.push(newNote);
        alert(`Note "${newNote.title}" saved.`);
    }
    
    currentEditingNoteId = null;
    saveState();
    renderNotesGrid();
    closeModal('note-editor-modal');
}

function handleDeleteNote() {
    if (!currentEditingNoteId) return;
    
    if (confirm(`Are you sure you want to delete the note "${document.getElementById('note-title-input').value.trim()}"?`)) { // FIX: updated ID from note-title-input
        state.notes = state.notes.filter(n => n.id !== currentEditingNoteId);
        saveState();
        renderNotesGrid();
        closeModal('note-editor-modal');
        currentEditingNoteId = null;
        alert("Note deleted successfully.");
    }
}


// --- EXAM COUNTDOWN ---

function renderExamList() {
    const container = document.getElementById('exam-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const now = new Date();
    
    // Process and sort exams (future exams first, nearest date)
    const processedExams = state.exams.map(exam => {
        const examDateObj = new Date(exam.date + "T00:00:00");
        const diffTime = examDateObj - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...exam, examDateObj, diffDays };
    });
    
    const sortedExams = processedExams.filter(exam => exam.diffDays >= 0)
        .sort((a, b) => a.examDateObj - b.examDateObj);

    if (sortedExams.length === 0) {
        container.innerHTML = '<p class="no-data">No upcoming exams scheduled. Focus Mode awaits!</p>';
        return;
    }

    sortedExams.forEach(exam => {
        const card = document.createElement('div');
        card.className = 'exam-card exam-item';
        
        let daysDisplay;
        if (exam.diffDays === 0) {
            daysDisplay = 'TODAY!';
        } else if (exam.diffDays === 1) {
            daysDisplay = 'TOMORROW!';
        } else {
            daysDisplay = `${exam.diffDays} <small>Days</small>`;
        }
        
        card.innerHTML = `
            <h3>${exam.name}</h3>
            <p class="exam-date-display"><i class="fas fa-calendar-alt"></i> ${exam.examDateObj.toDateString()}</p>
            <div class="countdown-display">${daysDisplay}</div>
            <button class="btn btn-danger btn-small remove-exam-btn" data-id="${exam.id}"><i class="fas fa-trash"></i></button>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.remove-exam-btn').forEach(btn => btn.addEventListener('click', removeExam));
    
    // Update overview after rendering list
    renderOverview(); 
}

function handleAddExam(e) {
    e.preventDefault();
    const nameInput = document.getElementById('exam-name');
    const dateInput = document.getElementById('exam-date');
    
    const name = nameInput.value.trim();
    const date = dateInput.value; // YYYY-MM-DD format

    if (!name || !date) return alert("Please fill both exam name and date.");

    const newExam = {
        id: Date.now().toString(),
        name: name,
        date: date
    };

    // Simple date validation
    const examDate = new Date(date + "T00:00:00");
    if (isNaN(examDate.getTime())) {
        alert("Invalid date entered.");
        return;
    }

    state.exams.push(newExam);
    saveState();
    renderExamList();
    
    // Clear form and provide feedback
    nameInput.value = '';
    dateInput.value = '';
    alert(`Exam "${name}" scheduled for ${date}!`);
}

function removeExam(e) {
    const id = e.currentTarget.getAttribute('data-id');
    state.exams = state.exams.filter(exam => exam.id !== id);
    saveState();
    renderExamList();
    alert("Exam removed.");
}

function toggleFocusMode() {
    state.isFocusMode = !state.isFocusMode;
    saveState();

    const body = document.body;
    const toggleButton = document.getElementById('focus-mode-toggle');
    
    if (state.isFocusMode) {
        body.classList.add('focus-mode-active');
        if (toggleButton) {
            toggleButton.innerHTML = '<i class="fas fa-undo"></i> Exit Focus Mode';
        }
        
        // Force switch to Exam Countdown view
        switchSection('countdown'); 
        alert("Focus Mode Activated! Sidebar navigation is restricted to Exam Countdown.");
    } else {
        body.classList.remove('focus-mode-active');
        if (toggleButton) {
            toggleButton.innerHTML = '<i class="fas fa-brain"></i> Toggle Focus Mode';
        }
        alert("Focus Mode Deactivated. Full dashboard access restored.");
    }
}

// --- PROFILE SECTION ---

function renderProfile() {
    // The profile section uses different IDs in the new HTML,
    // so we need to target the new IDs for rendering the state.
    const profileNameInput = document.getElementById('full-name');
    const profileStudentIdInput = document.getElementById('student-id');
    const profileMajorInput = document.getElementById('major');
    const profileEmailInput = document.getElementById('email');
    const profileSemesterInput = document.getElementById('current-semester');

    if (profileNameInput) profileNameInput.value = state.userName;
    if (profileStudentIdInput) profileStudentIdInput.value = state.studentId;
    if (profileMajorInput) profileMajorInput.value = state.major;
    if (profileEmailInput) profileEmailInput.value = state.email;
    if (profileSemesterInput) profileSemesterInput.value = state.currentSemester;
}

function handleProfileUpdate(event) {
    event.preventDefault();
    
    // Corrected IDs for form fields
    const profileNameInput = document.getElementById('full-name');
    const profileStudentIdInput = document.getElementById('student-id');
    const profileMajorInput = document.getElementById('major');
    const profileEmailInput = document.getElementById('email');
    const profileSemesterInput = document.getElementById('current-semester');

    // Retrieve values
    const newProfileName = profileNameInput ? profileNameInput.value.trim() : state.userName;
    const newStudentId = profileStudentIdInput ? profileStudentIdInput.value.trim() : state.studentId;
    const newMajor = profileMajorInput ? profileMajorInput.value.trim() : state.major;
    const newEmail = profileEmailInput ? profileEmailInput.value.trim() : state.email;
    const newSemester = profileSemesterInput ? parseInt(profileSemesterInput.value) : state.currentSemester;

    
    if (newProfileName !== state.userName) {
        updateUserNameDisplay(newProfileName); // This also saves the state
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
    if (confirm("Are you sure you want to log out? This will clear your dashboard data (if not using PWA storage).")) {
        // Clear IndexedDB state (for complete reset)
        const tx = db.transaction('state', 'readwrite');
        const store = tx.objectStore('state');
        store.clear(); 
        
        // Reload to force re-initialization
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
    const AVATAR_STORAGE_KEY = 'userAvatarDataURL'; // Keep in localStorage for simplicity

    const updateAndPersistAvatar = (input, imgElement) => {
        if (!input || !imgElement) return;
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataURL = event.target.result;
                    imgElement.src = dataURL;
                    // Update both avatars
                    if (navImage) navImage.src = dataURL;
                    if (profileImage) profileImage.src = dataURL;
                    // Persist to localStorage
                    localStorage.setItem(AVATAR_STORAGE_KEY, dataURL);
                    alert("Avatar updated successfully!");
                };
                reader.readAsDataURL(file);
            }
        });
    };
    
    // Load persisted avatar
    const persistedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (persistedAvatar) {
        if (navImage) navImage.src = persistedAvatar;
        if (profileImage) profileImage.src = persistedAvatar;
    }
    
    updateAndPersistAvatar(navInput, navImage);
    updateAndPersistAvatar(profileInput, profileImage);
    
    // Load and Initialize App
    async function initApp() {
        showLoadingOverlay();
        await openIndexedDB();
        await loadStateFromIndexedDB(); // This now calls rendering functions
        hideLoadingOverlay();
        initializeQuill(); // Init Quill after all other DOM is ready

        // Setup Listeners
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetSectionId = item.getAttribute('data-section');
                window.location.hash = targetSectionId; // Update hash for history/load
                switchSection(targetSectionId);
            });
        });

        // Add event listener for hash changes (e.g., browser back/forward)
        window.addEventListener('hashchange', () => {
            switchSection(getCurrentSectionHash());
        });

        setupThemeToggle();
        setupNotificationListeners();
        
        // Notes Section Listeners
        const newNoteBtn = document.getElementById('new-note-btn');
        if (newNoteBtn) newNoteBtn.addEventListener('click', () => openNoteEditor(null));
        const saveNoteBtn = document.getElementById('save-note-btn');
        if (saveNoteBtn) saveNoteBtn.addEventListener('click', handleSaveNote);
        const deleteNoteBtn = document.getElementById('delete-note-btn');
        if (deleteNoteBtn) deleteNoteBtn.addEventListener('click', handleDeleteNote);
        
        // Note Editor Download button
        const downloadEditorBtn = document.getElementById('downloadNoteEditorBtn');
        if (downloadEditorBtn) {
            downloadEditorBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // The user's HTML doesn't specify format, I'll default to TXT.
                downloadCurrentNoteFromEditor('txt');
            });
        }
        setupShareGlobalModal();
        setupDownloadGlobalModal();

        // GPA Calculator
        const addCourseBtn = document.getElementById('add-course-btn');
        if (addCourseBtn) addCourseBtn.addEventListener('click', handleAddCourse);
        const calcGpaBtn = document.getElementById('calculate-gpa-btn');
        if (calcGpaBtn) calcGpaBtn.addEventListener('click', handleCalculateGPA);
        const saveSemBtn = document.getElementById('save-semester-btn');
        if (saveSemBtn) saveSemBtn.addEventListener('click', handleSaveSemester);
        
        // CGPA Calculator
        const addManualSemBtn = document.getElementById('add-manual-sem-btn');
        if (addManualSemBtn) {
            addManualSemBtn.addEventListener('click', () => openModal('cgpa-manual-modal'));
        }
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
            focusModeToggle.addEventListener('click', toggleFocusMode);
        }
        
        // Profile
        const profileForm = document.getElementById('profile-update-form');
        if (profileForm) profileForm.addEventListener('submit', handleProfileUpdate);
        
        // Run initial notification checks (will schedule interval)
        scheduleNotificationChecks(); 
        
        // Data Backup/Restore (if implemented)
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
        
        // Set initial state of focus mode button
        if (state.isFocusMode && focusModeToggle) {
            focusModeToggle.innerHTML = '<i class="fas fa-undo"></i> Exit Focus Mode';
        }
        
        // Check for any initial query parameter or hash and switch to it
        switchSection(getCurrentSectionHash());
        
        // Ensure initial rendering of the current section
        const initialSection = getCurrentSectionHash();
        if (initialSection === 'gpa-calc') renderGPATable();
        if (initialSection === 'cgpa-calc') renderCGPAHistory();
        if (initialSection === 'timetable') renderTimetable();
        if (initialSection === 'notes') renderNotesGrid();
        if (initialSection === 'countdown') renderExamList();
        if (initialSection === 'profile') renderProfile();
        
        // Start the overview/exam/timetable refresh loop
        setInterval(renderOverview, 60000); // Update overview every minute

    }

    // Modal functions
    window.openModal = (modalId) => {
        document.getElementById(modalId).style.display = 'block';
    };

    window.closeModal = (modalId) => {
        document.getElementById(modalId).style.display = 'none';
    };

    document.querySelectorAll('.modal .close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.getAttribute('data-modal-id');
            closeModal(modalId);
        });
    });
    
    // Function to handle the loading screen
    function showLoadingOverlay() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const mainAppContainer = document.getElementById('main-app-container');
        const body = document.body;
        if (loadingOverlay && mainAppContainer) {
            loadingOverlay.classList.remove('hidden');
            mainAppContainer.classList.add('main-content-hidden');
            body.classList.add('no-scroll');
        }
    }
    
    function hideLoadingOverlay() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const mainAppContainer = document.getElementById('main-app-container');
        const body = document.body;
        
        if (loadingOverlay && mainAppContainer) {
            // Delay hiding the overlay to give all elements time to render
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
                mainAppContainer.classList.remove('main-content-hidden');
                mainAppContainer.classList.add('main-content-visible');
                setTimeout(() => {
                    body.classList.remove('no-scroll');
                }, 600);
            }, 500); // Shorter delay after IndexedDB success
        }
    }
    
    // Start the application
    initApp();
});


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
    alert("✅ Data exported successfully!");
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            state = importedState;
            saveState();
            alert("✅ Data imported successfully! The dashboard will reload.");
            window.location.reload();
        } catch (error) {
            console.error("Error importing data:", error);
            alert("❌ Failed to import data. The file might be corrupted or in an incorrect format.");
        }
    };
    reader.readAsText(file);
        }
