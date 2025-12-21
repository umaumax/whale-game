// --- Game Dimensions ---
export const WALL_THICKNESS = 50;
export const GAME_WIDTH = Math.min(window.innerWidth, 500); // 画面幅に合わせて最大500px
export const GAME_HEIGHT = Math.min(window.innerHeight - 160, 700); // ヘッダー分(100px) + 下部余白(60px)を確保
export const DEADLINE_Y = 100; // 上部のデッドライン

// 画面幅500pxを基準としたスケール率を計算
const SCALE = GAME_WIDTH / 500;

// --- 3. 進化テーブル（魚の階層） ---
export const THEMES = {
    fish: [
        { level: 1, name: "シラス", radius: Math.round(15 * SCALE), color: "#F5F5F5", score: 1, image: "assets/fish_01.png" },
        { level: 2, name: "アジ", radius: Math.round(24 * SCALE), color: "#87CEEB", score: 3, image: "assets/fish_02.png" },
        { level: 3, name: "ワカシ", radius: Math.round(33 * SCALE), color: "#98FB98", score: 6, image: "assets/fish_03.png" },
        { level: 4, name: "イナダ", radius: Math.round(42 * SCALE), color: "#FFD700", score: 10, image: "assets/fish_04.png" },
        { level: 5, name: "ワラサ", radius: Math.round(52 * SCALE), color: "#FFA500", score: 15, image: "assets/fish_05.png" },
        { level: 6, name: "ブリ", radius: Math.round(64 * SCALE), color: "#FF4500", score: 21, image: "assets/fish_06.png" },
        { level: 7, name: "タイ", radius: Math.round(76 * SCALE), color: "#FF69B4", score: 28, image: "assets/fish_07.png" },
        { level: 8, name: "カツオ", radius: Math.round(88 * SCALE), color: "#9370DB", score: 36, image: "assets/fish_08.png" },
        { level: 9, name: "マグロ", radius: Math.round(100 * SCALE), color: "#00008B", score: 45, image: "assets/fish_09.png" },
        { level: 10, name: "サメ", radius: Math.round(115 * SCALE), color: "#708090", score: 55, image: "assets/fish_10.png" },
        { level: 11, name: "クジラ", radius: Math.round(135 * SCALE), color: "#FFFFFF", score: 66, image: "assets/fish_11.png" }
    ],
    fruit: [
        { level: 1, name: "さくらんぼ", radius: Math.round(15 * SCALE), color: "#FF0000", score: 1, image: "assets/fruit_01.png" },
        { level: 2, name: "いちご", radius: Math.round(24 * SCALE), color: "#FF6666", score: 3, image: "assets/fruit_02.png" },
        { level: 3, name: "ぶどう", radius: Math.round(33 * SCALE), color: "#800080", score: 6, image: "assets/fruit_03.png" },
        { level: 4, name: "デコポン", radius: Math.round(42 * SCALE), color: "#FFA500", score: 10, image: "assets/fruit_04.png" },
        { level: 5, name: "かき", radius: Math.round(52 * SCALE), color: "#FF8C00", score: 15, image: "assets/fruit_05.png" },
        { level: 6, name: "りんご", radius: Math.round(64 * SCALE), color: "#FF0000", score: 21, image: "assets/fruit_06.png" },
        { level: 7, name: "なし", radius: Math.round(76 * SCALE), color: "#FFFFE0", score: 28, image: "assets/fruit_07.png" },
        { level: 8, name: "もも", radius: Math.round(88 * SCALE), color: "#FFC0CB", score: 36, image: "assets/fruit_08.png" },
        { level: 9, name: "パイナップル", radius: Math.round(100 * SCALE), color: "#FFFF00", score: 45, image: "assets/fruit_09.png" },
        { level: 10, name: "メロン", radius: Math.round(115 * SCALE), color: "#90EE90", score: 55, image: "assets/fruit_10.png" },
        { level: 11, name: "スイカ", radius: Math.round(135 * SCALE), color: "#006400", score: 66, image: "assets/fruit_11.png" }
    ]
};

// ドロップ可能な最大レベル (01:シラス ～ 05:ワラサ)
export const MAX_DROP_LEVEL = 5;
