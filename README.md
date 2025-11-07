Overview
UniPortal is a comprehensive Progressive Web App (PWA) designed for university students to efficiently manage their academic life. It provides essential tools for GPA calculation, timetable management, note-taking, exam tracking, and intelligent notifications to help students stay organized and focused throughout their academic journey.
Features
Core Features
1. Dashboard Overview
Real-time academic statistics display
Current GPA and CGPA tracking
Upcoming class notifications
Days countdown until next exam
Interactive GPA progress chart visualization
Quick access to all major sections
Personalized welcome messages
2. GPA Calculator
Add multiple courses with customizable units and grades
Real-time GPA calculation using 5-point scale (A-F)
Academic standing feedback and evaluation
Save semester results for CGPA tracking
Motivational feedback system based on performance
Course management (add, edit, remove)
Grade point validation
3. CGPA Calculator
Track academic performance across multiple semesters
Automatic cumulative GPA calculation
Manual semester entry option for past records
Visual progress circle indicator
Comprehensive semester history management
Delete individual semesters
Total units and quality points tracking
4. Weekly Timetable
Interactive weekly schedule (Monday through Friday)
Add and edit classes with course codes and times
Visual time-slot grid covering 8 AM to 5 PM
Click-to-remove functionality for easy editing
Built-in time conflict detection
12-hour time format display
Subject name and course code organization
5. Notes Section
Rich text editor powered by Quill.js
Create, edit, and delete notes seamlessly
Full HTML formatting support (bold, italic, lists, headers)
Share notes via native device share API
Download notes as formatted text files
Auto-save functionality to prevent data loss
Note preview in grid layout
Search and organization capabilities
6. Exam Countdown Tracker
Schedule and manage upcoming exams
Real-time countdown display in days
Smart notifications at strategic intervals (40, 20, 10, 5, 2, 1 days, and exam day)
Visual exam cards with dates and exam names
Remove completed or cancelled exams
Automatic sorting by date
Focus mode toggle for distraction-free studying
7. Smart Notification System
Class Reminders: Automated alerts at 1 hour, 30 minutes, 15 minutes, and 10 minutes before each class
Daily Summary: Morning overview of all scheduled classes at 7:00 AM
Exam Alerts: Multi-stage countdown notifications for adequate preparation time
Browser Notifications: Push notifications work even when the app is closed (PWA feature)
In-App Notifications: Persistent notification center accessible from any page
Notification Management: Clear all notifications with one click
Permission Handling: Easy notification permission requests
8. Profile Management
Edit personal information (name, major, current semester)
Student ID display and management
Avatar upload with image preview
Theme toggle between Light and Dark modes
Data backup and restore functionality
Profile picture synchronization across all pages
Account information preservation
9. Data Management
Export: Complete data backup as JSON file with timestamped filename
Import: Restore data from backup file with validation
IndexedDB Storage: Fast, reliable, and offline-capable storage system
Automatic Migration: Seamless upgrade from localStorage to IndexedDB
Data Integrity: Validation checks during import/export
No Data Loss: Persistent storage across browser sessions
10. Progressive Web App (PWA)
Install on desktop and mobile devices
Full offline functionality after initial load
Background notifications via Service Worker
Fast loading with intelligent caching strategies
Native app-like experience with smooth animations
Home screen icon support
Splash screen on launch
Standalone window mode
Additional Features

11.Responsive Design
Mobile-first approach with adaptive layouts
Hamburger menu for mobile navigation
Touch-friendly interface elements
Optimized for screens from 320px to 4K displays
Portrait and landscape orientation support
12. Accessibility
Semantic HTML structure
Keyboard navigation support
Screen reader compatible
High contrast mode support
Focus indicators for interactive elements
ARIA labels where appropriate
13. Performance Optimization
Lazy loading for images and charts
Debounced save operations
Efficient DOM updates
Service Worker caching
Minimal external dependencies
Optimized asset delivery
14. Data Visualization
Interactive line charts for GPA trends
Color-coded academic standing indicators
Progress circles for CGPA display
Visual timetable grid
Exam countdown cards
15. User Experience Enhancements
Loading screen with animations
Save indicators for user feedback
Confirmation dialogs for destructive actions
Empty state messages
Error handling with user-friendly messages
Smooth transitions and animations
