/**
 * ふりかえりBot - Cloudflare Worker
 * 役割: Workers AIを使って「明日やること」の候補3件を生成する
 * APIキー不要・完全無料（Workers AI無料枠を使用）
 */

export default {
  async fetch(request, env) {

    // ===== CORS対応 =====
    // GitHub Pages（gitgt58.github.io）からのリクエストを許可
    const allowedOrigins = [
      'https://gitgt58.github.io',
      'http://localhost',        // ローカル開発用
      'http://127.0.0.1',
    ];
    const origin = request.headers.get('Origin') || '';
    const isAllowed = allowedOrigins.some(o => origin.startsWith(o));
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // プリフライトリクエスト（OPTIONSメソッド）への応答
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // POSTメソッド以外は拒否
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    // ===== リクエスト本文を取得 =====
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'リクエストの形式が正しくありません' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { goalTitle, goalDesc, achievement, good, bad } = body;

    // 必須パラメータチェック
    if (!goalTitle) {
      return new Response(
        JSON.stringify({ error: '目標タイトルが必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== プロンプト生成 =====
    const prompt = `あなたは目標達成をサポートするコーチです。
以下の情報をもとに、明日取り組むべき具体的な行動を3件だけ提案してください。

【目標】${goalTitle}
【目標の詳細】${goalDesc || 'なし'}
【今日の達成度】${achievement || 0}%
【うまくいったこと】${good || '特になし'}
【できなかったこと】${bad || '特になし'}

出力ルール（厳守）:
- 3件を番号付きリストで出力する
- 各行動は1文で簡潔に（20文字以内）
- 具体的で明日すぐ実行できる内容
- 前置き・説明・まとめは一切不要
- 日本語で出力

出力例:
1. 朝食前に体重を記録する
2. 夕食の炭水化物を半分にする
3. 10分間のストレッチを行う`;

    // ===== Workers AI呼び出し =====
    try {
      const response = await env.AI.run(
        '@cf/meta/llama-3.1-8b-instruct',
        {
          messages: [
            {
              role: 'system',
              content: 'あなたは目標達成コーチです。指示された形式を厳密に守って日本語で回答してください。',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 200,
          temperature: 0.7,
        }
      );

      // レスポンスからテキストを取得
      const text = response?.response || '';

      // 番号付きリストをパースして配列に変換
      const candidates = text
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^[1-3][.\．、]/.test(l))
        .map(l => l.replace(/^[1-3][.\．、]\s*/, '').trim())
        .filter(l => l.length > 0)
        .slice(0, 3);

      // パースに失敗した場合はテキスト全体を返す
      if (candidates.length === 0) {
        return new Response(
          JSON.stringify({ candidates: [], raw: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ candidates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (err) {
      console.error('Workers AI error:', err);
      return new Response(
        JSON.stringify({ error: 'AI処理中にエラーが発生しました', detail: err.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};
