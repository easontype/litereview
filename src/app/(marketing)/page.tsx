"use client";

/**
 * 商品介紹頁 —「硃批」編輯排印風（見 design-prototype/litereview Landing.html 原型）。
 * 動畫全部走 transform/opacity；互動 JS 集中在單一 useEffect，卸載時完整清除。
 */

import { useEffect, useRef } from "react";
import Link from "next/link";

const GITHUB = "https://github.com/easontype/litereview";

const MARQUEE_ITEMS = [
  "OpenAlex",
  "Semantic Scholar",
  "arXiv",
  "Zotero",
  "Claude",
  "OpenAI",
  "Gemini",
  "Ollama",
  "SQLite",
  "MIT License",
];

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = matchMedia("(pointer: fine)").matches;
    const cleanups: (() => void)[] = [];
    let dead = false;

    /* nav 滾動加底 + 閱讀進度線（rAF 節流） */
    const nav = root.querySelector<HTMLElement>("nav");
    const progress = root.querySelector<HTMLElement>(".progress");
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        nav?.classList.toggle("scrolled", window.scrollY > 12);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (progress) progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));

    /* 滾動 reveal（含 .stagger 子項與 .flow-track 硃線） */
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    root.querySelectorAll(".reveal, .stagger, .frame").forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    /* hero 滑鼠 3D 傾斜（lerp，僅桌面指標） */
    const tilt = root.querySelector<HTMLElement>(".tilt-wrap");
    const hero = root.querySelector<HTMLElement>(".hero");
    if (tilt && hero && fine && !reduced) {
      let tx = 0,
        ty = 0,
        cx = 0,
        cy = 0,
        raf: number | null = null;
      const loop = () => {
        cx += (tx - cx) * 0.08;
        cy += (ty - cy) * 0.08;
        tilt.style.transform = `perspective(1000px) rotateX(${cy}deg) rotateY(${cx}deg)`;
        if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(loop);
        else raf = null;
      };
      const onMove = (ev: MouseEvent) => {
        const r = hero.getBoundingClientRect();
        tx = ((ev.clientX - r.left) / r.width - 0.5) * 7;
        ty = -((ev.clientY - r.top) / r.height - 0.5) * 5;
        if (!raf) raf = requestAnimationFrame(loop);
      };
      const onLeave = () => {
        tx = 0;
        ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      };
      hero.addEventListener("mousemove", onMove);
      hero.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        hero.removeEventListener("mousemove", onMove);
        hero.removeEventListener("mouseleave", onLeave);
        if (raf) cancelAnimationFrame(raf);
      });
    }

    /* 磁吸按鈕 */
    if (fine && !reduced) {
      root.querySelectorAll<HTMLElement>(".magnetic").forEach((btn) => {
        const onMove = (ev: MouseEvent) => {
          const r = btn.getBoundingClientRect();
          const dx = ev.clientX - (r.left + r.width / 2);
          const dy = ev.clientY - (r.top + r.height / 2);
          btn.style.transform = `translate(${dx * 0.18}px, ${dy * 0.3}px)`;
        };
        const onLeave = () => {
          btn.style.transition =
            "transform .4s cubic-bezier(.22,.8,.32,1), background .25s, color .25s, box-shadow .25s, border-color .25s";
          btn.style.transform = "";
          setTimeout(() => {
            btn.style.transition = "";
          }, 400);
        };
        btn.addEventListener("mousemove", onMove);
        btn.addEventListener("mouseleave", onLeave);
        cleanups.push(() => {
          btn.removeEventListener("mousemove", onMove);
          btn.removeEventListener("mouseleave", onLeave);
          btn.style.transform = "";
        });
      });
    }

    /* 自訂硃點游標 */
    if (fine && !reduced) {
      root.classList.add("fine-cursor");
      const dot = root.querySelector<HTMLElement>(".cursor-dot");
      const ring = root.querySelector<HTMLElement>(".cursor-ring");
      let mx = -100,
        my = -100,
        rx = -100,
        ry = -100,
        rs = 1,
        craf: number | null = null;
      const cloop = () => {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        const targetS = ring?.classList.contains("on") ? 1.7 : 1;
        rs += (targetS - rs) * 0.18;
        if (ring) ring.style.transform = `translate(${rx}px, ${ry}px) scale(${rs})`;
        if (dot) dot.style.transform = `translate(${mx}px, ${my}px)`;
        craf = requestAnimationFrame(cloop);
      };
      const onMove = (ev: MouseEvent) => {
        mx = ev.clientX;
        my = ev.clientY;
        root.classList.add("cursor-live");
        if (!craf) craf = requestAnimationFrame(cloop);
      };
      window.addEventListener("mousemove", onMove, { passive: true });
      const hoverEls = [...root.querySelectorAll<HTMLElement>("a, button, .btn")];
      const onEnter = () => ring?.classList.add("on");
      const onExit = () => ring?.classList.remove("on");
      hoverEls.forEach((el) => {
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mouseleave", onExit);
      });
      cleanups.push(() => {
        window.removeEventListener("mousemove", onMove);
        hoverEls.forEach((el) => {
          el.removeEventListener("mouseenter", onEnter);
          el.removeEventListener("mouseleave", onExit);
        });
        if (craf) cancelAnimationFrame(craf);
        root.classList.remove("fine-cursor", "cursor-live");
      });
    }

    /* 「閱訖」硃印：尾聲進視野時戳章 */
    const seal = root.querySelector<HTMLElement>(".seal");
    const coda = root.querySelector<HTMLElement>(".coda");
    if (seal && coda && !reduced) {
      const sio = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            seal.classList.add("stamped");
            sio.disconnect();
          }
        },
        { threshold: 0.5 }
      );
      sio.observe(coda);
      cleanups.push(() => sio.disconnect());
    } else if (seal) {
      seal.style.opacity = ".92";
      seal.style.transform = "rotate(-7deg)";
    }

    /* 辯論區：SSE 風格逐字串流（進視野觸發一次） */
    const debate = root.querySelector<HTMLElement>(".debate-stage");
    if (debate) {
      const bubbles = [...debate.querySelectorAll<HTMLElement>(".bubble")];
      const verdict = debate.querySelector<HTMLElement>(".verdict");
      if (reduced) {
        bubbles.forEach((b) => b.classList.add("show"));
        verdict?.classList.add("show");
      } else {
        // 先清空文字，存到 dataset，等進視野再打出來（dataset 已存在時沿用，避免 dev 雙掛載清成空字串）
        bubbles.forEach((b) => {
          const t = b.querySelector<HTMLElement>(".txt");
          if (!t) return;
          if (!b.dataset.full) b.dataset.full = (t.textContent ?? "").trim();
          t.textContent = "";
        });
        const typeInto = (bubble: HTMLElement) =>
          new Promise<void>((res) => {
            bubble.classList.add("show");
            const t = bubble.querySelector<HTMLElement>(".txt");
            const caret = document.createElement("span");
            caret.className = "tcaret";
            bubble.appendChild(caret);
            const full = bubble.dataset.full ?? "";
            let i = 0;
            const tick = () => {
              if (dead) {
                caret.remove();
                return;
              }
              i += 1 + (Math.random() < 0.3 ? 1 : 0); // 模擬 token 節奏
              if (t) t.textContent = full.slice(0, i);
              if (i < full.length) setTimeout(tick, 26);
              else {
                caret.remove();
                res();
              }
            };
            tick();
          });
        const dio = new IntersectionObserver(
          async (entries) => {
            if (!entries[0].isIntersecting) return;
            dio.disconnect();
            await new Promise((r) => setTimeout(r, 350));
            for (const b of bubbles) {
              if (dead) return;
              await typeInto(b);
              await new Promise((r) => setTimeout(r, 420));
            }
            if (!dead) verdict?.classList.add("show");
          },
          { threshold: 0.35 }
        );
        dio.observe(debate);
        cleanups.push(() => dio.disconnect());
      }
    }

    return () => {
      dead = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <div ref={rootRef} className="mkt">
      <div className="progress" />
      <div className="cursor-ring" />
      <div className="cursor-dot" />

      <nav>
        <div className="nav-inner">
          <a className="wordmark" href="#">
            litereview<span className="dot">。</span>
          </a>
          <div className="nav-links">
            <a href="#features">功能</a>
            <a href="#flow">流程</a>
            <a href="#local">本機優先</a>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer">
              GitHub ↗
            </a>
            <Link className="btn btn-primary btn-sm magnetic" href="/dashboard">
              進入工作台
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <header className="hero">
        <div className="hero-ghost ghost-char">批</div>
        <div className="float-cite" style={{ top: "26%", left: "46%" }}>
          [17]
        </div>
        <div className="float-cite f2" style={{ top: "64%", left: "40%" }}>
          [3]
        </div>
        <div className="float-cite f3" style={{ top: "20%", left: "8%" }}>
          †
        </div>
        <div className="side-label">本機執行・開源 MIT・訂閱即用</div>
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <div className="kicker hero-enter d1">litereview — 個人文獻研究工具</div>
              <h1 className="hero-enter d2">
                替每一篇論文，
                <br />
                留下
                <span className="circled">
                  硃批
                  <svg viewBox="0 0 200 92" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M18,50 C14,18 64,7 104,9 C154,11 190,24 187,48 C184,76 136,86 92,83 C50,80 14,68 20,44" />
                  </svg>
                </span>
                。
              </h1>
              <p className="hero-sub hero-enter d3">
                <span className="emph">匯入、找重點、比較、辯論</span>——文獻研究一氣呵成。
                Zotero 一鍵匯入、九欄位深度重點、五維比較表， 還能讓
                <strong>多個模型針對爭點攻防</strong>，裁判給出判決。 全部在你自己的電腦上完成。
              </p>
              <div className="hero-ctas hero-enter d4">
                <Link className="btn btn-primary magnetic" href="/dashboard">
                  進入工作台
                </Link>
                <a className="btn btn-ghost magnetic" href={GITHUB} target="_blank" rel="noopener noreferrer">
                  開源原始碼 ↗
                </a>
              </div>
              <p className="hero-note hero-enter d4">
                不需帳號 · 不需雲端 · 預設走 Claude 訂閱，<em>不另計 API 費</em>
              </p>
            </div>

            {/* 硃批動畫（滑鼠傾斜 + 14s 迴圈） */}
            <div className="hero-enter d3">
              <div className="tilt-wrap">
                <div className="anno-stage" aria-hidden="true">
                  <div className="sheet">
                    <div className="sheet-title">Attention Is All You Need</div>
                    <div className="sheet-authors">Vaswani et al. · NeurIPS 2017 · arXiv:1706.03762</div>
                    <p className="sheet-abs">
                      The dominant sequence transduction models are based on complex recurrent or convolutional
                      neural networks that include an encoder and a decoder.{" "}
                      <span className="hl hl1">
                        We propose a new simple network architecture, the Transformer, based solely on attention
                        mechanisms
                      </span>
                      , dispensing with recurrence and convolutions entirely. Experiments on two machine
                      translation tasks show these models to be{" "}
                      <span className="hl hl2">
                        superior in quality while being more parallelizable and requiring significantly less time
                        to train
                      </span>
                      . Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving
                      over the existing best results.{" "}
                      <span className="hl hl3">The Transformer generalizes well to other tasks</span> by applying
                      it successfully to English constituency parsing both with large and limited training data.
                    </p>
                    <div className="margin-notes">
                      <div className="mnote n1">
                        <small>方法</small>純注意力架構，捨棄遞迴與卷積
                      </div>
                      <div className="mnote n2">
                        <small>發現</small>品質更佳、可平行、訓練更快
                      </div>
                      <div className="mnote n3">
                        <small>新穎度</small>9 / 10 — 範式轉移
                      </div>
                    </div>
                  </div>
                  <div className="chip-tray">
                    <span className="kchip">研究問題</span>
                    <span className="kchip">方法</span>
                    <span className="kchip">資料與實驗</span>
                    <span className="kchip">主要發現</span>
                    <span className="kchip">貢獻</span>
                    <span className="kchip">侷限性</span>
                    <span className="kchip hot">新穎度 9/10</span>
                    <span className="kchip">關鍵公式</span>
                    <span className="kchip">後續方向</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ 生態系跑馬燈 ═══ */}
      <div className="marquee" aria-hidden="true">
        <div className="m-track">
          {[0, 1].map((copy) =>
            MARQUEE_ITEMS.map((item) => (
              <span key={`${copy}-${item}`} style={{ display: "contents" }}>
                <span className="m-item">{item}</span>
                <span className="m-sep">◆</span>
              </span>
            ))
          )}
        </div>
      </div>

      <main id="features">
        {/* ═══ F1 匯入 ═══ */}
        <section className="block">
          <div className="wrap">
            <div className="feature-grid">
              <div className="f-copy reveal">
                <div className="ghost-no">01</div>
                <div className="eyebrow">01 · 匯入 IMPORT</div>
                <h2>
                  你的文獻庫，
                  <br />
                  一鍵搬進來。
                </h2>
                <p className="lede">
                  從 <strong>Zotero</strong> 挑選匯入、或直接上傳 PDF——
                  litereview 不重做搜尋引擎，專心把你已經找到的論文
                  <strong>讀深、讀透</strong>。
                </p>
                <ul className="f-points">
                  <li>
                    <strong>Zotero 本機匯入</strong>：勾選即加入工作區，分析筆記還能回寫
                  </li>
                  <li>
                    <strong>期刊分級徽章</strong>：SJR Q1–Q4、CORE A*–C，一眼判斷值不值得讀
                  </li>
                  <li>
                    <strong>上傳 PDF</strong>：地端轉換全文，不用雲端 API
                  </li>
                </ul>
              </div>
              <div className="f-visual reveal dly1">
                <div className="frame">
                  <div className="frame-cap">Import — Zotero / PDF</div>
                  <div className="s-input">
                    mechanochemical-synthesis.pdf<span className="caret" />
                  </div>
                  <div className="s-sources">
                    <span className="s-src">Zotero 12</span>
                    <span className="s-src">上傳 PDF 3</span>
                    <span className="s-merge">→ 工作區 15 篇</span>
                  </div>
                  <div className="stagger">
                    <div className="s-row">
                      <span className="t">Attention Is All You Need</span>
                      <span className="badge astar">CORE A*</span>
                      <span className="cite">被引 140k</span>
                    </div>
                    <div className="s-row">
                      <span className="t">BERT: Pre-training of Deep Bidirectional Transformers</span>
                      <span className="badge q1">SJR Q1</span>
                      <span className="cite">被引 110k</span>
                    </div>
                    <div className="s-row">
                      <span className="t">Efficient Transformers: A Survey</span>
                      <span className="badge q2">SJR Q2</span>
                      <span className="cite">被引 2.1k</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ F2 找重點 ═══ */}
        <section className="block">
          <div className="wrap">
            <div className="feature-grid flip">
              <div className="f-copy reveal">
                <div className="ghost-no">02</div>
                <div className="eyebrow">02 · 精讀 KEYPOINTS</div>
                <h2>
                  九個欄位，
                  <br />
                  把一篇論文拆透。
                </h2>
                <p className="lede">
                  不是摘要的摘要。litereview 優先抓<strong>全文</strong>
                  （arXiv → 上傳 PDF → 開放取用版本）， 再由 LLM
                  產出結構化重點——從研究問題到關鍵公式，逐欄拆解。
                </p>
                <ul className="f-points">
                  <li>
                    全文抓不到時<strong>誠實標示「僅摘要」</strong>，不假裝讀過
                  </li>
                  <li>
                    分析結果可<strong>一鍵回寫 Zotero</strong> 成為子筆記
                  </li>
                  <li>典型一篇 1–2 分鐘完成，結果永久快取在本機</li>
                </ul>
              </div>
              <div className="f-visual reveal dly1">
                <div className="frame">
                  <div className="frame-cap">Keypoints — 九欄位結構化重點</div>
                  <div className="k-grid stagger">
                    <div className="k-cell">
                      <b>研究問題</b>
                      <span>遞迴架構難以平行化…</span>
                    </div>
                    <div className="k-cell">
                      <b>方法</b>
                      <span>多頭自注意力 + 位置編碼</span>
                    </div>
                    <div className="k-cell">
                      <b>資料與實驗</b>
                      <span>WMT14 En-De / En-Fr</span>
                    </div>
                    <div className="k-cell">
                      <b>主要發現</b>
                      <span>28.4 BLEU，訓練成本大減</span>
                    </div>
                    <div className="k-cell">
                      <b>貢獻</b>
                      <span>首個純注意力序列模型</span>
                    </div>
                    <div className="k-cell">
                      <b>侷限性</b>
                      <span>O(n²) 記憶體隨序列長度</span>
                    </div>
                    <div className="k-cell hot">
                      <b>新穎度</b>
                      <span>範式轉移級</span>
                      <div className="k-bar">
                        <i />
                      </div>
                    </div>
                    <div className="k-cell">
                      <b>關鍵公式</b>
                      <span>softmax(QKᵀ/√d)V</span>
                    </div>
                    <div className="k-cell">
                      <b>後續方向</b>
                      <span>更長序列、其他模態</span>
                    </div>
                  </div>
                  <div className="k-foot">
                    全文來源：arXiv (ar5iv) ✓ &nbsp;·&nbsp; 抓不到時 → <em>⚠ 僅摘要</em>（明確標示）
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ F3 比較 ═══ */}
        <section className="block">
          <div className="wrap">
            <div className="feature-grid">
              <div className="f-copy reveal">
                <div className="ghost-no">03</div>
                <div className="eyebrow">03 · 對讀 COMPARE</div>
                <h2>
                  2 到 6 篇，
                  <br />
                  五個維度，一張表。
                </h2>
                <p className="lede">
                  相關工作各說各話？勾選工作區裡的論文，litereview 沿
                  <strong>方法、實驗、貢獻、侷限、新穎度</strong>五個維度逐一對齊， 最後給一段綜合結論。
                </p>
                <ul className="f-points">
                  <li>
                    還沒分析過的論文會<strong>自動先跑找重點</strong>，不用手動排隊
                  </li>
                  <li>
                    每次比較都<strong>存成可回訪的紀錄</strong>，寫作時隨時引用
                  </li>
                </ul>
              </div>
              <div className="f-visual reveal dly1">
                <div className="frame">
                  <div className="frame-cap">Compare — 五維比較表</div>
                  <table className="c-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Transformer</th>
                        <th>BERT</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="dim">方法</td>
                        <td>編碼器-解碼器，純注意力</td>
                        <td>僅編碼器，雙向遮罩預訓練</td>
                      </tr>
                      <tr>
                        <td className="dim">實驗</td>
                        <td>WMT14 翻譯</td>
                        <td>GLUE / SQuAD 微調</td>
                      </tr>
                      <tr>
                        <td className="dim">貢獻</td>
                        <td>架構本身</td>
                        <td>預訓練-微調範式</td>
                      </tr>
                      <tr>
                        <td className="dim">侷限</td>
                        <td>O(n²) 序列長度</td>
                        <td>算力門檻、遮罩偏差</td>
                      </tr>
                      <tr>
                        <td className="dim">新穎度</td>
                        <td>9 / 10</td>
                        <td>8 / 10</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="c-verdict">
                    綜合結論：前者奠定架構地基，後者證明其遷移價值——引用時宜分開定位，不宜互為替代。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ F4 辯論（暗場 + SSE 串流）═══ */}
        <section className="night">
          <div className="wrap">
            <div className="feature-grid flip">
              <div className="f-copy reveal">
                <div className="ghost-no">04</div>
                <div className="eyebrow">04 · 攻防 DEBATE</div>
                <h2>
                  讓模型吵一架，
                  <br />
                  你聽結論。
                </h2>
                <p className="lede">
                  先由審查員給出五維 scorecard 與<strong>可辯論的爭點</strong>，
                  一鍵發起辯論：正反方多輪攻防、裁判評分判決， 逐字稿即時串流呈現。
                </p>
                <ul className="f-points">
                  <li>
                    六個座位（找重點／比較／審查／正方／反方／裁判）<strong>可各自指派模型</strong>
                  </li>
                  <li>
                    讓反方或裁判用<strong>不同家的模型</strong>，避免自我偏好
                  </li>
                  <li>支援 OpenAI、Gemini、Anthropic API 與任何相容端點（DeepSeek／Groq／Ollama）</li>
                </ul>
              </div>
              <div className="f-visual">
                <div className="debate-stage">
                  <div className="live-tag">
                    <span className="pulse" />
                    LIVE · SSE STREAMING
                  </div>
                  <div className="motion-card">
                    <small>MOTION · 來自審查爭點</small>
                    自注意力的 O(n²) 複雜度，是否為長序列任務的根本瓶頸？
                  </div>
                  <div className="bubble pro">
                    <small>正方 · claude</small>
                    <span className="txt">
                      記憶體隨序列長度平方成長是架構性事實：128k 上下文的 KV cache
                      成本已成部署的第一瓶頸，各種線性化嘗試至今未在品質上追平。
                    </span>
                  </div>
                  <div className="bubble con">
                    <small>反方 · gemini</small>
                    <span className="txt">
                      「瓶頸」不等於「根本」。FlashAttention
                      已把常數項壓低一個量級，且實務上長文任務的失效多來自訓練分布，而非注意力本身的複雜度。
                    </span>
                  </div>
                  <div className="verdict">
                    <small>VERDICT · 裁判 · gpt</small>
                    <div className="v-row">
                      <span className="who">正方 claude</span>
                      <div className="v-track">
                        <i style={{ width: "65%" }} />
                      </div>
                      <span className="pt">6.5</span>
                    </div>
                    <div className="v-row">
                      <span className="who">反方 gemini</span>
                      <div className="v-track">
                        <i style={{ width: "78%" }} />
                      </div>
                      <span className="pt">7.8</span>
                    </div>
                    <div className="v-line">
                      <b>反方勝。</b>正方未能回應「工程緩解使複雜度不再是首要失效因素」的證據鏈。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 流程 ═══ */}
        <section className="flow" id="flow">
          <div className="wrap">
            <div className="reveal">
              <div className="eyebrow">HOW IT WORKS</div>
              <h2>從一篇論文，到一場判決。</h2>
            </div>
            <div className="flow-track reveal">
              <div className="step">
                <span className="no">01</span>
                <h3>匯入論文</h3>
                <p>從 Zotero 一鍵匯入，或直接上傳 PDF 進工作區。</p>
              </div>
              <div className="step">
                <span className="no">02</span>
                <h3>找重點</h3>
                <p>抓全文、九欄位深度分析，狀態即時顯示在側欄。</p>
              </div>
              <div className="step">
                <span className="no">03</span>
                <h3>比較</h3>
                <p>勾 2–6 篇，五維對齊成一張表 + 綜合結論。</p>
              </div>
              <div className="step">
                <span className="no">04</span>
                <h3>審查</h3>
                <p>五維評分 scorecard、優缺點、可辯論的爭點。</p>
              </div>
              <div className="step">
                <span className="no">05</span>
                <h3>辯論</h3>
                <p>正反攻防、裁判判決，逐字稿即時串流。</p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ local-first ═══ */}
        <section className="local" id="local">
          <div className="wrap">
            <div className="reveal" style={{ textAlign: "center" }}>
              <div className="eyebrow" style={{ justifyContent: "center" }}>
                LOCAL-FIRST · OPEN SOURCE
              </div>
              <h2>你的研究，留在你的電腦。</h2>
              <p className="lede" style={{ margin: "0 auto" }}>
                沒有帳號系統、沒有雲端同步、沒有遙測。
              </p>
            </div>
            <div className="local-grid">
              <div className="local-card reveal">
                <span className="glyph">庫</span>
                <h3>資料不出門</h3>
                <p>
                  所有論文、分析、辯論紀錄與 API key 都存在本機 <code>SQLite</code>；上傳的 PDF
                  也只放在你的磁碟。刪掉資料夾，就真的刪乾淨了。
                </p>
              </div>
              <div className="local-card reveal dly1">
                <span className="glyph">訂</span>
                <h3>訂閱即用，不另付費</h3>
                <p>
                  預設模型走 <code>claude</code> CLI，用你既有的 Claude 訂閱登入 token——
                  <strong>不吃 API key、不另計費</strong>。想換 OpenAI、Gemini 或本機
                  Ollama？設定中心隨時調度。
                </p>
              </div>
              <div className="local-card reveal dly2">
                <span className="glyph">源</span>
                <h3>MIT 開源</h3>
                <p>
                  整套原始碼公開在 GitHub，MIT 授權。prompt、分析管線、辯論引擎全部攤在陽光下——
                  你可以審計它，也可以改造它。
                </p>
              </div>
            </div>
            <div className="local-foot reveal">
              git clone → npm install → <em>npm run dev</em> ，三步開始。
            </div>
          </div>
        </section>

        {/* ═══ 尾聲 CTA ═══ */}
        <section className="coda">
          <div className="seal">閱訖</div>
          <div className="wrap reveal">
            <h2>
              下一篇論文，
              <br />
              讓它先過一場辯論。
            </h2>
            <p>打開工作台，把今天存下來的那篇 PDF 丟進去。</p>
            <Link className="btn btn-primary magnetic" href="/dashboard">
              進入工作台
            </Link>
          </div>
        </section>
      </main>

      <footer>
        <div className="foot-inner">
          <a className="wordmark" href="#">
            litereview<span className="dot">。</span>
          </a>
          <span className="foot-tag">personal literature review · local-first</span>
          <div className="foot-links">
            <a href={GITHUB} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={`${GITHUB}/blob/master/LICENSE`} target="_blank" rel="noopener noreferrer">
              MIT License
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
