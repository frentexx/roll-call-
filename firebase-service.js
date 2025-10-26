// 導入 Firebase 核心模塊（只導入一次，避免重複）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 替換成你的 Firebase 項目配置（從 Firebase 控制台複製）
const firebaseConfig = {
  apiKey: "你的APIKey",
  authDomain: "你的項目ID.firebaseapp.com",
  projectId: "你的項目ID",
  storageBucket: "你的項目ID.appspot.com",
  messagingSenderId: "你的SenderID",
  appId: "你的AppID"
};

// 初始化 Firebase 應用（只初始化一次）
const app = initializeApp(firebaseConfig);

// 初始化 Firebase 服務（只聲明一次，避免重複）
const auth = getAuth(app); // 身份驗證服務
const db = getFirestore(app); // 數據庫服務

// 匿名登錄函數（確保沒有重複聲明）
async function anonymousLogin() {
  try {
    const userCredential = await signInAnonymously(auth);
    const user = userCredential.user;
    console.log("匿名登錄成功，用戶ID：", user.uid);
    // 登錄成功後可以觸發後續操作（例如加載數據）
    loadDataAfterLogin(); // 假設你有這個函數用於加載頁面數據
  } catch (error) {
    console.error("匿名登錄失敗：", error.message);
    alert("登錄失敗，請刷新頁面重試");
  }
}

// 頁面加載時自動執行匿名登錄
anonymousLogin();

// 暴露服務實例供其他文件使用（如果需要）
export { auth, db };
