export class AudioManager {
    constructor() {
        // AudioContextの作成 (クロスブラウザ対応)
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        // マスターボリューム
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // 音量 (0.0 ~ 1.0)
        this.masterGain.connect(this.ctx.destination);
    }

    // ユーザー操作時にコンテキストを再開する（ブラウザの自動再生ポリシー対策）
    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // 落下音: 短い「ポッ」という音
    playDrop() {
        this.resume();
        const t = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        // 音程: 400Hzから急速に下がる
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        
        // 音量: 一瞬で消える
        gain.gain.setValueAtTime(1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        
        osc.start(t);
        osc.stop(t + 0.1);
    }

    // 合体音: 「ポンッ！」（レベルが高いほど高い音）
    playMerge(level) {
        this.resume();
        const t = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        // 音程: レベルに応じて高くする (半音階のような計算)
        const freq = 220 * Math.pow(1.05946, level * 2); 
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.linearRampToValueAtTime(freq * 1.5, t + 0.1); // ピッチを少し上げる
        
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        
        osc.start(t);
        osc.stop(t + 0.15);
    }
}
