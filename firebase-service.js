// firebase-service.js - 此文件包含所有Firebase配置和核心功能
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, collection, query, addDoc, updateDoc, Timestamp, setDoc, where, getDocs, setLogLevel, onSnapshot } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Firebase配置信息 (在此文件中隱藏)
const firebaseConfig = {
    apiKey: "AIzaSyAko3jZkh_OGTw7kqxFwhX5SRJtbNll0Cw",
    authDomain: "roll-ppshclass.firebaseapp.com",
    projectId: "roll-ppshclass",
    storageBucket: "roll-ppshclass.firebasestorage.app",
    messagingSenderId: "690929841439",
    appId: "1:690929841439:web:9f3653ce07e64ba461ac2a",
    measurementId: "G-WYP0NLT1RD"
};

// 全域變數
let db;
let auth;
let userId = null;
let attendanceRecords = [];
let leaveRequests = [];
let studentRoster = [];
let rosterHeaders = [];
let className = "預設班級";
let dailyRollCallState = {};

// Firestore路徑
const ATTENDANCE_PATH = `attendance`;
const LEAVE_REQUESTS_PATH = `leave_requests`;
const ROSTER_PATH = `roster/class_data`;

// 初始化Firebase
export async function initFirebase() {
    try {
        setLogLevel('debug');
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        await setPersistence(auth, browserSessionPersistence);
        await signInAnonymously(auth);
        
        return new Promise((resolve) => {
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    userId = user.uid;
                    startFirestoreListeners();
                    resolve(true);
                }
            });
        });
    } catch (error) {
        console.error("Firebase初始化錯誤:", error);
        throw error;
    }
}

// 获取Firebase实例
export function getDb() {
    return db;
}

export function getAuth() {
    return auth;
}

export function getUserId() {
    return userId;
}

export function getAttendanceRecords() {
    return [...attendanceRecords];
}

export function getLeaveRequests() {
    return [...leaveRequests];
}

export function getStudentRoster() {
    return [...studentRoster];
}

export function getRosterHeaders() {
    return [...rosterHeaders];
}

export function getClassName() {
    return className;
}

export function getDailyRollCallState() {
    return { ...dailyRollCallState };
}

// 班級名單管理
export function uploadRoster(roster, name, headers) {
    const docRef = doc(db, ROSTER_PATH);
    return setDoc(docRef, { 
        list: JSON.stringify(roster), 
        headers: JSON.stringify(headers), 
        className: name,
        updatedAt: Timestamp.now() 
    })
    .then(() => {
        showMessage(`名單成功上傳！共 ${roster.length} 筆學生資料。`, 'success');
    })
    .catch(error => {
        console.error("儲存名單失敗:", error);
        showMessage('儲存名單失敗。', 'error');
    });
}

export function saveClassName(newName) {
    if (studentRoster.length === 0) {
        className = newName;
        showMessage(`班級名稱已更新為 ${newName}`, 'success');
        return;
    }
    
    const docRef = doc(db, ROSTER_PATH);
    return setDoc(docRef, { 
        list: JSON.stringify(studentRoster), 
        headers: JSON.stringify(rosterHeaders), 
        className: newName,
        updatedAt: Timestamp.now() 
    })
    .then(() => {
        showMessage(`班級名稱已更新為 ${newName}`, 'success');
    })
    .catch(error => {
        console.error("更新班級名稱失敗:", error);
        showMessage('更新班級名稱失敗。', 'error');
    });
}

export function deleteRoster() {
    const docRef = doc(db, ROSTER_PATH);
    return setDoc(docRef, { 
        list: JSON.stringify([]), 
        headers: JSON.stringify([]), 
        className: className,
        updatedAt: Timestamp.now() 
    })
    .then(() => {
        showMessage('班級名單已清空。', 'success');
    })
    .catch(error => {
        console.error("清空名單失敗:", error);
        showMessage('清空名單失敗。', 'error');
    });
}

// 請假管理
export function submitLeaveRequest(leaveData) {
    return addDoc(collection(db, LEAVE_REQUESTS_PATH), {
        ...leaveData,
        status: 'Pending',
        submittedAt: Timestamp.now(),
        recordedBy: userId
    })
    .then(() => {
        showMessage('請假申請提交成功！等待管理員審核。', 'success');
    })
    .catch((error) => {
        console.error("請假提交失敗: ", error);
        showMessage('請假提交失敗。', 'error');
    });
}

export function updateLeaveStatus(docId, newStatus) {
    if (!userId) { 
        showMessage('權限不足。', 'error'); 
        return Promise.reject(new Error('未授權'));
    }
    
    const docRef = doc(db, LEAVE_REQUESTS_PATH, docId);
    return updateDoc(docRef, { status: newStatus })
    .then(() => {
        const statusText = newStatus === 'Approved' ? '已批准' : '已拒絕';
        showMessage(`請假申請已${statusText}。`, 'success');
    })
    .catch((error) => {
        console.error("更新請假狀態失敗: ", error);
        showMessage('更新狀態失敗。', 'error');
    });
}

// 點名管理
export function initializeRollCallState(dateKey) {
    if (!studentRoster.length) {
        dailyRollCallState = {};
        return;
    }

    // 取得先前儲存的點名狀態
    const todayAttendance = attendanceRecords.filter(r => r.dateKey === dateKey && r.type === 'DailyRollCall');
    const savedState = {};
    todayAttendance.forEach(record => {
        if (!savedState[record.studentId] || record.timestamp.seconds > savedState[record.studentId].timestamp.seconds) {
            savedState[record.studentId] = record.status; 
        }
    });
    
    // 取得已核准的請假
    const overlappingApprovedLeaves = leaveRequests.filter(r => 
        r.status === 'Approved' && checkLeaveOverlap(r, dateKey)
    );
    
    const leaveState = {};
    overlappingApprovedLeaves.forEach(leave => {
        leaveState[leave.studentId] = 'Leave';
    });

    // 合併狀態
    dailyRollCallState = {};
    studentRoster.forEach(student => {
        const studentId = student.id;
        
        if (savedState[studentId]) {
             dailyRollCallState[studentId] = savedState[studentId];
        } else if (leaveState[studentId] === 'Leave') {
            dailyRollCallState[studentId] = 'Leave';
        } else {
            dailyRollCallState[studentId] = 'Present';
        }
    });
}

export function toggleStudentStatus(studentId) {
    const currentStatus = dailyRollCallState[studentId] || 'Present';
    let newStatus;
    
    if (currentStatus === 'Leave') {
        newStatus = 'Present';
    } else if (currentStatus === 'Present') {
        newStatus = 'Absent';
    } else if (currentStatus === 'Absent') {
        newStatus = 'Late';
    } else {
        newStatus = 'Present';
    }
    
    dailyRollCallState[studentId] = newStatus;
}

export function saveDailyRollCall(dateKey, rollCallState, students) {
    const attendanceCollection = collection(db, ATTENDANCE_PATH);
    const now = Timestamp.now();
    const batch = [];

    students.forEach(student => {
        const status = rollCallState[student.id];
        if (status) {
            batch.push(addDoc(attendanceCollection, {
                studentId: student.id,
                userName: student.name,
                status: status,
                timestamp: now,
                dateKey: dateKey,
                type: 'DailyRollCall',
                recordedBy: userId
            }));
        }
    });
    
    return Promise.all(batch)
    .then(() => {
        showMessage(`已成功儲存 ${students.length} 筆 ${dateKey} 的點名紀錄！`, 'success');
    })
    .catch(error => {
        console.error("儲存點名記錄失敗:", error);
        showMessage('儲存點名記錄失敗。', 'error');
    });
}

// 查詢與匯出
export function searchLeaveHistory(startDate, endDate) {
    const leaveRequests = getLeaveRequests();
    return leaveRequests.filter(request => {
        const requestDateStr = request.startDateTime ? request.startDateTime.split('T')[0] : null;
        if (!requestDateStr) return false;
        
        const requestStartTime = new Date(requestDateStr + 'T00:00:00').getTime();
        return requestStartTime >= startDate && requestStartTime <= endDate;
    }).sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime());
}

export function exportLeaveHistory(results) {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "請假起始日期時間,請假結束日期時間,學生名稱,學號,狀態,請假原因,提交時間\n";

    results.forEach(item => {
        const submittedTimeString = item.submittedAt && typeof item.submittedAt.toDate === 'function'
            ? new Date(item.submittedAt.toDate()).toLocaleString('zh-TW')
            : 'N/A';
        
        const statusText = item.status === 'Approved' ? '已批准' : item.status === 'Rejected' ? '已拒絕' : '待審核';
        
        const row = [
            formatDateTime(item.startDateTime),
            formatDateTime(item.endDateTime),
            item.userName,
            item.studentId || 'N/A', 
            statusText,
            `"${item.reason.replace(/"/g, '""').replace(/\n/g, ' ')}"`, 
            submittedTimeString
        ];
        csvContent += row.join(',') + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `leave_records_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage(`已成功匯出 ${results.length} 筆請假記錄。`, 'success');
}

// 工具函數
function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return 'N/A';
    const [datePart, timePart] = dateTimeStr.split('T');
    if (datePart && timePart) {
        return `${datePart.replace(/-/g, '/')} ${timePart}`;
    }
    return dateTimeStr.replace(/-/g, '/');
}

function checkLeaveOverlap(leave, dateKey) {
    if (!leave.startDateTime || !leave.endDateTime) return false;

    const rollCallStart = new Date(dateKey + 'T00:00:00').getTime();
    const rollCallEnd = new Date(dateKey + 'T23:59:59').getTime();
    const leaveStart = new Date(leave.startDateTime).getTime();
    const leaveEnd = new Date(leave.endDateTime).getTime();

    return leaveStart < rollCallEnd && leaveEnd > rollCallStart;
}

function showMessage(text, type = 'info') {
    // 此處使用DOM操作顯示消息
    const msgBox = document.getElementById('message-box');
    if (!msgBox) return;
    
    const color = type === 'success' ? 'bg-green-100 text-green-800 border-green-400' :
                  type === 'error' ? 'bg-red-100 text-red-800 border-red-400' :
                  'bg-yellow-100 text-yellow-800 border-yellow-400';
    
    msgBox.innerHTML = `<div class="p-3 rounded-lg ${color} border shadow-md text-sm">${text}</div>`;
    msgBox.classList.remove('hidden');
    
    setTimeout(() => {
        msgBox.classList.add('hidden');
    }, 4000);
}

// Firestore監聽器
function startFirestoreListeners() {
    if (!db) return;
    
    // 載入班級名單
    const rosterDoc = doc(db, ROSTER_PATH);
    onSnapshot(rosterDoc, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            try {
                studentRoster = JSON.parse(data.list || '[]');
                rosterHeaders = JSON.parse(data.headers || '[]');
                className = data.className || "預設班級";
            } catch (e) {
                console.error("解析學生名單失敗:", e);
                studentRoster = [];
                rosterHeaders = [];
            }
        } else {
            studentRoster = [];
            rosterHeaders = [];
        }
    });

    // 監聽點名記錄
    onSnapshot(collection(db, ATTENDANCE_PATH), (snapshot) => {
        attendanceRecords = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            timestamp: doc.data().timestamp instanceof Timestamp ? doc.data().timestamp : new Timestamp(doc.data().timestamp.seconds, doc.data().timestamp.nanoseconds)
        }));
        attendanceRecords.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
    });

    // 監聽請假請求
    onSnapshot(collection(db, LEAVE_REQUESTS_PATH), (snapshot) => {
        leaveRequests = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            submittedAt: doc.data().submittedAt instanceof Timestamp ? doc.data().submittedAt : new Timestamp(doc.data().submittedAt.seconds, doc.data().submittedAt.nanoseconds)
        }));
        leaveRequests.sort((a, b) => b.submittedAt.seconds - a.submittedAt.seconds);
    });
}