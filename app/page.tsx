'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, runTransaction, set, DatabaseReference } from 'firebase/database';
import { Send, Wifi, WifiOff, Users, XCircle, RefreshCw, Calendar, Settings, Plus, Trash2, X, Coffee } from 'lucide-react';

// ============================================
// Firebase設定
// ============================================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Firebase初期化
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database = getDatabase(app);

// GAS URL
const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || '';

// ============================================
// 型定義
// ============================================
interface CustomerData {
  new: number;
  repeat: number;
}

interface StaffDataItem {
  treatment: CustomerData;
  booking2w: CustomerData;
  booking4w: CustomerData;
}

interface StaffDataMap {
  [key: string]: StaffDataItem;
}

interface ShopData {
  declined: number;
  cancelled: number;
}

// ============================================
// 定数定義
// ============================================
const DEFAULT_STAFF_LIST = ['新井', '津川', '岸本', '二谷', '中間'];

const CUSTOMER_TYPES = [
  { key: 'new', label: '新規', color: 'bg-blue-500 hover:bg-blue-600' },
  { key: 'repeat', label: 'リピ', color: 'bg-green-500 hover:bg-green-600' },
];

const getToday = () => new Date().toISOString().split('T')[0];

// ============================================
// アトミック更新関数（Firebase用）
// ============================================
const atomicIncrement = async (path: string, delta: number = 1): Promise<{ success: boolean; error?: string }> => {
  const targetRef: DatabaseReference = ref(database, path);
  try {
    await runTransaction(targetRef, (currentValue: number | null) => {
      const current = currentValue || 0;
      return Math.max(0, current + delta);
    });
    return { success: true };
  } catch (error) {
    console.error('Transaction failed:', error);
    return { success: false, error: (error as Error).message };
  }
};

// ============================================
// カウンターボタン
// ============================================
interface CounterButtonProps {
  value: number;
  colorClass: string;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled: boolean;
  size?: 'normal' | 'small';
}

const CounterButton: React.FC<CounterButtonProps> = ({ value, colorClass, onIncrement, onDecrement, disabled, size = 'normal' }) => {
  const [isPressing, setIsPressing] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);
  const isHandled = useRef(false);

  const handlePressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchstart') e.preventDefault();
    if (isHandled.current) return;
    isHandled.current = true;
    
    longPressTriggered.current = false;
    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setIsPressing(true);
      onDecrement();
    }, 500);
  }, [onDecrement]);

  const handlePressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchend') e.preventDefault();
    if (pressTimer.current) clearTimeout(pressTimer.current);
    setIsPressing(false);
    
    if (!longPressTriggered.current && isHandled.current) {
      onIncrement();
    }
    setTimeout(() => { isHandled.current = false; }, 100);
  }, [onIncrement]);

  const handlePressCancel = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    setIsPressing(false);
    longPressTriggered.current = false;
    isHandled.current = false;
  }, []);

  const sizeClasses = size === 'small' 
    ? 'w-9 h-9 text-base' 
    : 'w-11 h-11 text-lg';

  return (
    <button
      className={`
        ${colorClass} 
        ${isPressing ? 'scale-95 ring-2 ring-red-400' : ''}
        text-white font-bold 
        ${sizeClasses}
        rounded-lg shadow-md
        flex items-center justify-center
        transition-all duration-150
        active:scale-95
        disabled:opacity-50 disabled:cursor-not-allowed
        select-none touch-none
      `}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressCancel}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressCancel}
      disabled={disabled}
    >
      {value}
    </button>
  );
};

// ============================================
// スタッフカード
// ============================================
interface StaffCardProps {
  name: string;
  data: StaffDataItem | undefined;
  onUpdate: (staffName: string, category: string, customerKey: string, delta: number) => void;
  onToggleOff: (name: string) => void;
  isOff: boolean;
  disabled: boolean;
}

const StaffCard: React.FC<StaffCardProps> = ({ name, data, onUpdate, onToggleOff, isOff, disabled }) => {
  const treatmentTotal = (data?.treatment?.new || 0) + (data?.treatment?.repeat || 0);

  if (isOff) {
    return (
      <div className="bg-gray-100 rounded-xl p-3 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coffee className="w-4 h-4 text-gray-400" />
          <span className="font-bold text-gray-400">{name}</span>
          <span className="text-xs text-gray-400">公休</span>
        </div>
        <button
          onClick={() => onToggleOff(name)}
          className="text-xs bg-white text-gray-600 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50"
        >
          出勤に変更
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-2.5 mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-800">{name}</span>
          <span className="bg-purple-500 text-white font-bold text-sm w-7 h-7 rounded-full flex items-center justify-center">
            {treatmentTotal}
          </span>
        </div>
        <button
          onClick={() => onToggleOff(name)}
          className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded hover:bg-gray-200"
        >
          公休
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-purple-50 rounded-lg p-1.5">
          <div className="text-[10px] font-bold text-purple-700 text-center mb-1">施術</div>
          <div className="flex justify-center gap-1">
            {CUSTOMER_TYPES.map(c => (
              <div key={c.key} className="flex flex-col items-center">
                <span className="text-[8px] text-gray-500">{c.label}</span>
                <CounterButton
                  value={data?.treatment?.[c.key as keyof CustomerData] || 0}
                  colorClass={c.color}
                  onIncrement={() => onUpdate(name, 'treatment', c.key, 1)}
                  onDecrement={() => onUpdate(name, 'treatment', c.key, -1)}
                  disabled={disabled}
                  size="small"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-amber-50 rounded-lg p-1.5">
          <div className="text-[10px] font-bold text-amber-700 text-center mb-1">2W</div>
          <div className="flex justify-center gap-1">
            {CUSTOMER_TYPES.map(c => (
              <div key={c.key} className="flex flex-col items-center">
                <span className="text-[8px] text-gray-500">{c.label}</span>
                <CounterButton
                  value={data?.booking2w?.[c.key as keyof CustomerData] || 0}
                  colorClass={c.color}
                  onIncrement={() => onUpdate(name, 'booking2w', c.key, 1)}
                  onDecrement={() => onUpdate(name, 'booking2w', c.key, -1)}
                  disabled={disabled}
                  size="small"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-1.5">
          <div className="text-[10px] font-bold text-orange-700 text-center mb-1">4W</div>
          <div className="flex justify-center gap-1">
            {CUSTOMER_TYPES.map(c => (
              <div key={c.key} className="flex flex-col items-center">
                <span className="text-[8px] text-gray-500">{c.label}</span>
                <CounterButton
                  value={data?.booking4w?.[c.key as keyof CustomerData] || 0}
                  colorClass={c.color}
                  onIncrement={() => onUpdate(name, 'booking4w', c.key, 1)}
                  onDecrement={() => onUpdate(name, 'booking4w', c.key, -1)}
                  disabled={disabled}
                  size="small"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// サマリー
// ============================================
interface DailySummaryProps {
  staffData: StaffDataMap;
  shopData: ShopData;
  offStaff: string[];
  onShopUpdate: (counterKey: string, delta: number) => void;
  disabled: boolean;
}

const DailySummary: React.FC<DailySummaryProps> = ({ staffData, shopData, offStaff, onShopUpdate, disabled }) => {
  let treatmentTotal = 0, treatmentNew = 0, treatmentRepeat = 0;
  let booking2wTotal = 0, booking4wTotal = 0;

  Object.entries(staffData).forEach(([name, staff]) => {
    if (offStaff.includes(name)) return;
    treatmentNew += staff?.treatment?.new || 0;
    treatmentRepeat += staff?.treatment?.repeat || 0;
    booking2wTotal += (staff?.booking2w?.new || 0) + (staff?.booking2w?.repeat || 0);
    booking4wTotal += (staff?.booking4w?.new || 0) + (staff?.booking4w?.repeat || 0);
  });
  treatmentTotal = treatmentNew + treatmentRepeat;

  const bookingRate = treatmentTotal > 0 
    ? Math.round((booking2wTotal + booking4wTotal) / treatmentTotal * 100) 
    : 0;

  const bookingTotal = booking2wTotal + booking4wTotal;

  return (
    <div className="bg-gradient-to-br from-emerald-100 to-green-50 rounded-xl p-2.5 mb-3">
      <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl p-3 mb-2 text-center shadow-lg">
        <div className="text-white text-opacity-80 text-xs mb-0.5">本日の次回予約数</div>
        <div className="text-white text-4xl font-bold">{bookingTotal}</div>
        <div className="text-white text-opacity-70 text-[10px] mt-0.5">2W: {booking2wTotal} ／ 4W: {booking4wTotal}</div>
      </div>
      
      <div className="grid grid-cols-6 gap-1.5 text-center">
        <div className="bg-white rounded-lg p-1.5 shadow-sm">
          <div className="text-lg font-bold text-purple-600">{treatmentTotal}</div>
          <div className="text-[9px] text-gray-500">総施術数</div>
        </div>
        <div className="bg-white rounded-lg p-1.5 shadow-sm">
          <div className="text-base font-bold text-blue-600">{treatmentNew}</div>
          <div className="text-[9px] text-gray-500">新規</div>
        </div>
        <div className="bg-white rounded-lg p-1.5 shadow-sm">
          <div className="text-base font-bold text-green-600">{treatmentRepeat}</div>
          <div className="text-[9px] text-gray-500">リピ</div>
        </div>
        <div className="bg-white rounded-lg p-1.5 shadow-sm">
          <div className="text-base font-bold text-emerald-600">{bookingRate}%</div>
          <div className="text-[9px] text-gray-500">予約率</div>
        </div>
        <div className="flex flex-col items-center">
          <CounterButton
            value={shopData?.declined || 0}
            colorClass="bg-red-500 hover:bg-red-600"
            onIncrement={() => onShopUpdate('declined', 1)}
            onDecrement={() => onShopUpdate('declined', -1)}
            disabled={disabled}
            size="normal"
          />
          <div className="text-[9px] text-gray-500 mt-0.5">お断り</div>
        </div>
        <div className="flex flex-col items-center">
          <CounterButton
            value={shopData?.cancelled || 0}
            colorClass="bg-gray-500 hover:bg-gray-600"
            onIncrement={() => onShopUpdate('cancelled', 1)}
            onDecrement={() => onShopUpdate('cancelled', -1)}
            disabled={disabled}
            size="normal"
          />
          <div className="text-[9px] text-gray-500 mt-0.5">キャンセル</div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// スタッフ管理モーダル
// ============================================
interface StaffManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: string[];
  onAddStaff: (name: string) => void;
  onRemoveStaff: (name: string) => void;
}

const StaffManageModal: React.FC<StaffManageModalProps> = ({ isOpen, onClose, staffList, onAddStaff, onRemoveStaff }) => {
  const [newName, setNewName] = useState('');

  if (!isOpen) return null;

  const handleAdd = () => {
    if (newName.trim() && !staffList.includes(newName.trim())) {
      onAddStaff(newName.trim());
      setNewName('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">スタッフ管理</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {staffList.map(name => (
            <div key={name} className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
              <span>{name}</span>
              <button
                onClick={() => onRemoveStaff(name)}
                className="text-red-500 hover:bg-red-50 p-1 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新しいスタッフ名"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            追加
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// メインアプリ
// ============================================
export default function HeadSpaCounter() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString('ja-JP'));
  const [showSettings, setShowSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [staffList, setStaffList] = useState<string[]>([]);
  const [staffListLoaded, setStaffListLoaded] = useState(false);
  const [staffData, setStaffData] = useState<StaffDataMap>({});
  const [shopData, setShopData] = useState<ShopData>({ declined: 0, cancelled: 0 });
  const [offStaff, setOffStaff] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationImage, setCelebrationImage] = useState('');

  // お疲れ様画像のリスト（URLを差し替えてください）
  const celebrationImages = [
    'https://i.imgur.com/4lz8VS0.jpg',
    'https://i.imgur.com/V4eaMzi.jpg',
    'https://i.imgur.com/SpWgzJq.jpg',
    'https://i.imgur.com/fuM1URC.jpg',
    'https://i.imgur.com/k2fnU2T.jpg',
  ];

  // スタッフリストをFirebaseから読み込み（初回のみ）
  useEffect(() => {
    const staffListRef = ref(database, 'senzu-counter/settings/staffList');
    
    const unsubscribe = onValue(staffListRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Array.isArray(data)) {
        setStaffList(data);
      } else {
        // 初回はデフォルトを設定してFirebaseに保存
        const defaultList = ['新井', '津川', '岸本', '二谷', '中間'];
        setStaffList(defaultList);
        set(staffListRef, defaultList);
      }
      setStaffListLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  // Firebase リアルタイム同期
  useEffect(() => {
    const dateRef = ref(database, `senzu-counter/${selectedDate}`);
    
    const unsubscribe = onValue(dateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStaffData(data.staffData || {});
        setShopData(data.shopData || { declined: 0, cancelled: 0 });
        setOffStaff(data.offStaff || []);
        setConfirmed(data.confirmed || false);
      } else {
        const initial: StaffDataMap = {};
        staffList.forEach(name => {
          initial[name] = {
            treatment: { new: 0, repeat: 0 },
            booking2w: { new: 0, repeat: 0 },
            booking4w: { new: 0, repeat: 0 },
          };
        });
        setStaffData(initial);
        setShopData({ declined: 0, cancelled: 0 });
        setOffStaff([]);
        setConfirmed(false);
      }
      setLastSync(new Date().toLocaleTimeString('ja-JP'));
    });

    return () => unsubscribe();
  }, [selectedDate, staffList]);

  // オンライン状態監視
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 公休トグル
  const handleToggleOff = async (name: string) => {
    const newOffStaff = offStaff.includes(name)
      ? offStaff.filter(n => n !== name)
      : [...offStaff, name];
    
    await set(ref(database, `senzu-counter/${selectedDate}/offStaff`), newOffStaff);
  };

  // スタッフ追加（Firebaseに保存）
  const handleAddStaff = async (name: string) => {
    const newList = [...staffList, name];
    setStaffList(newList);
    await set(ref(database, 'senzu-counter/settings/staffList'), newList);
  };

  // スタッフ削除（Firebaseに保存）
  const handleRemoveStaff = async (name: string) => {
    const newList = staffList.filter(n => n !== name);
    setStaffList(newList);
    await set(ref(database, 'senzu-counter/settings/staffList'), newList);
  };

  // カウント更新
  const handleStaffUpdate = async (staffName: string, category: string, customerKey: string, delta: number) => {
    const path = `senzu-counter/${selectedDate}/staffData/${staffName}/${category}/${customerKey}`;
    await atomicIncrement(path, delta);
  };

  const handleShopUpdate = async (counterKey: string, delta: number) => {
    const path = `senzu-counter/${selectedDate}/shopData/${counterKey}`;
    await atomicIncrement(path, delta);
  };

  // 確定＆スプレッドシート送信
  const handleConfirm = async () => {
    if (!window.confirm('本日のデータを確定してスプレッドシートに送信しますか？')) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (GAS_URL) {
        const payload = {
          date: selectedDate,
          staffData: staffData,
          shopData: shopData,
          timestamp: new Date().toISOString()
        };
        
        await fetch(GAS_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      
      await set(ref(database, `senzu-counter/${selectedDate}/confirmed`), true);
      
      // お疲れ様画像をランダム表示
      const randomImage = celebrationImages[Math.floor(Math.random() * celebrationImages.length)];
      setCelebrationImage(randomImage);
      setShowCelebration(true);
      
      // 3秒後に自動で消える
      setTimeout(() => {
        setShowCelebration(false);
      }, 3000);
      
    } catch (error) {
      console.error('送信エラー:', error);
      alert('❌ 送信に失敗しました: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // スタッフリストが読み込まれるまでローディング表示
  if (!staffListLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 flex items-center justify-center">
        <div className="text-emerald-600 text-lg">読み込み中...</div>
      </div>
    );
  }

  const workingStaff = staffList.filter(name => !offStaff.includes(name));
  const restingStaff = staffList.filter(name => offStaff.includes(name));

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50">
      <header className="bg-white shadow-md sticky top-0 z-40">
        <div className="max-w-md mx-auto px-3 py-2">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-emerald-700">🌿 仙豆のちから 次回予約カウント</h1>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                isOnline ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
              }`}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <Settings className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border rounded-lg px-2 py-0.5 text-sm flex-1"
            />
            {selectedDate !== getToday() && (
              <button
                onClick={() => setSelectedDate(getToday())}
                className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg"
              >
                今日
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 py-2">
        <DailySummary 
          staffData={staffData} 
          shopData={shopData} 
          offStaff={offStaff} 
          onShopUpdate={handleShopUpdate}
          disabled={confirmed}
        />

        {workingStaff.map(name => (
          <StaffCard
            key={name}
            name={name}
            data={staffData[name]}
            onUpdate={handleStaffUpdate}
            onToggleOff={handleToggleOff}
            isOff={false}
            disabled={confirmed}
          />
        ))}

        {restingStaff.length > 0 && (
          <div className="mb-2">
            <div className="text-xs text-gray-400 mb-1">公休中 ({restingStaff.length}名)</div>
            {restingStaff.map(name => (
              <StaffCard
                key={name}
                name={name}
                data={staffData[name]}
                onUpdate={handleStaffUpdate}
                onToggleOff={handleToggleOff}
                isOff={true}
                disabled={confirmed}
              />
            ))}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={confirmed || isSubmitting}
          className={`
            w-full py-2.5 rounded-xl font-bold text-sm
            flex items-center justify-center gap-2
            ${confirmed
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg active:scale-98'
            }
          `}
        >
          <Send className="w-4 h-4" />
          {isSubmitting ? '送信中...' : confirmed ? '確定済み' : 'データを確定'}
        </button>

        {confirmed && (
          <div className="mt-2 bg-green-100 text-green-700 text-center py-2 rounded-xl text-xs flex items-center justify-center gap-2">
            <span>✅ 確定済み</span>
            <button
              onClick={async () => {
                if (window.confirm('確定を解除して再編集しますか？')) {
                  await set(ref(database, `senzu-counter/${selectedDate}/confirmed`), false);
                }
              }}
              className="bg-white text-gray-600 px-2 py-1 rounded-lg text-xs hover:bg-gray-100"
            >
              解除して再編集
            </button>
          </div>
        )}
      </main>

      <footer className="text-center text-[10px] text-gray-400 py-2">
        同期: {lastSync} | タップ:+1 長押し:-1
      </footer>

      <StaffManageModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        staffList={staffList}
        onAddStaff={handleAddStaff}
        onRemoveStaff={handleRemoveStaff}
      />

      {/* お疲れ様オーバーレイ */}
      {showCelebration && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => setShowCelebration(false)}
        >
          <div className="text-center animate-scale-in">
            <img 
              src={celebrationImage} 
              alt="お疲れ様でした！" 
              className="max-w-[80vw] max-h-[60vh] rounded-2xl shadow-2xl"
            />
            <p className="text-white text-xl font-bold mt-4 drop-shadow-lg">
              🎉 お疲れ様でした！ 🎉
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
