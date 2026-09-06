export const FEEDBACK_CONTRIBUTION_ENTRY = `
            <section class="candidate2-settings-section">
                <button id="settings-feedback-open" class="candidate2-settings-action-row" type="button" aria-haspopup="dialog" aria-controls="feedback-contribution-modal"><span>反馈与共建<small>反馈问题，或参与修复</small></span><i aria-hidden="true"></i></button>
            </section>`;

export const FEEDBACK_CONTRIBUTION_MODAL = `
    <div id="feedback-contribution-modal" class="candidate2-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-contribution-title" aria-describedby="feedback-contribution-note" hidden>
        <section class="candidate2-feedback-paper">
            <button id="feedback-contribution-close" class="candidate2-feedback-close" type="button" aria-label="关闭反馈与共建">×</button>
            <h2 id="feedback-contribution-title">反馈与共建</h2>
            <p id="feedback-contribution-note">将前往 GitHub。报错内容公开，请去除隐私。</p>
            <div class="candidate2-feedback-links">
                <a href="https://github.com/wxynora/doorbell-commons/issues/new?template=bug_report.yml" target="_blank" rel="noopener noreferrer">反馈问题</a>
                <a href="https://github.com/wxynora/doorbell-commons/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">参与修复</a>
            </div>
        </section>
    </div>`;

export const FEEDBACK_CONTRIBUTION_STYLES = `
        .candidate2-feedback-modal {
            position: fixed;
            inset: 0;
            z-index: 400;
            display: grid;
            place-items: center;
            padding: 20px;
            background: rgba(83, 63, 53, 0.3);
        }
        .candidate2-feedback-modal[hidden] { display: none; }
        .candidate2-feedback-paper {
            position: relative;
            box-sizing: border-box;
            width: min(320px, 100%);
            max-height: calc(100dvh - 40px);
            overflow-y: auto;
            padding: 28px 24px 20px;
            border: 0.5px solid #e1d5c9;
            color: #60483f;
            background: #fffdf9;
            box-shadow: 2px 3px 4px rgba(83, 63, 53, 0.08);
            font-family: var(--ui-regular-font);
        }
        .candidate2-feedback-paper h2 {
            margin: 0 28px 12px 0;
            font-family: inherit;
            font-size: 19px;
            font-style: normal;
            font-weight: 600;
        }
        .candidate2-feedback-paper p {
            margin: 0 0 20px;
            color: #80675c;
            font-size: 12px;
            line-height: 1.7;
        }
        .candidate2-feedback-close {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 44px;
            height: 44px;
            padding: 0;
            border: 0;
            color: #80675c;
            background: transparent;
            font: 24px/1 var(--ui-regular-font);
            cursor: pointer;
        }
        .candidate2-feedback-links a {
            display: flex;
            min-height: 48px;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid #eadfd4;
            color: #60483f;
            font-size: 14px;
            text-decoration: none;
        }
        .candidate2-feedback-links a::after {
            width: 7px;
            height: 7px;
            margin-right: 4px;
            border-top: 1px solid #ad9184;
            border-right: 1px solid #ad9184;
            transform: rotate(45deg);
            content: '';
        }
        .candidate2-feedback-links a:hover,
        .candidate2-feedback-close:hover { color: #47332a; background: #f8f0e7; }
        .candidate2-feedback-links a:active,
        .candidate2-feedback-close:active { background: #eee2d5; }
        #settings-feedback-open { min-height: 44px; }
        #settings-feedback-open:focus-visible,
        .candidate2-feedback-links a:focus-visible,
        .candidate2-feedback-close:focus-visible {
            outline: 2px solid #80675c;
            outline-offset: 3px;
        }
`;

// This stays local to the embedded settings UI: no bridge action, fetch, or
// account-derived URL is needed. Only an explicit anchor click leaves the page.
export const FEEDBACK_CONTRIBUTION_SCRIPT = `
(() => {
    const entry = document.getElementById('settings-feedback-open');
    const modal = document.getElementById('feedback-contribution-modal');
    const close = document.getElementById('feedback-contribution-close');
    const controls = Array.from(modal.querySelectorAll('button, a'));
    function closeFeedback() {
        modal.hidden = true;
        entry.focus();
    }
    entry.addEventListener('click', () => {
        modal.hidden = false;
        close.focus();
    });
    close.addEventListener('click', closeFeedback);
    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeFeedback();
        } else if (event.key === 'Tab') {
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
})();
`;
