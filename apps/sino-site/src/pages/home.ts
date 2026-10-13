import type { SiteContext } from '../context.ts'
import { html, type Html } from '../html.ts'
import { icon, type IconName } from '../icons.ts'
import type { PageSpec } from '../layout.ts'

/**
 * Canvas `Landing`, with text true to what runs today (D-241): Gmail only, no reminders, scheduled sending, snooze,
 * browser notifications, data export or identity list. Adds what Sino asks Google for and why (D-245).
 */
export function homePage(ctx: SiteContext): PageSpec {
  return {
    path: '/',
    file: 'index.html',
    lang: 'vi',
    title: 'Sino · Hộp thư chung cho Gmail và việc cần làm',
    description:
      'Sino gom các tài khoản Gmail của bạn vào một hộp thư chung. Đọc, trả lời và giữ việc cần làm ở cùng một chỗ.',
    main: html`${hero(ctx)}
${strip()}
${features()}
${planning(ctx)}
${howItWorks()}
${privacy()}
${faq()}
${band(ctx)}`,
  }
}

const soonBadge = html`<span class="badge">Sắp có</span>`

interface MailRow {
  sender: string
  subject: string
  preview: string
  time: string
  unread?: boolean
  selected?: boolean
  count?: number
  flag?: { icon: IconName; text: string }
}

function mailRow(row: MailRow): Html {
  const cls = ['mrow', row.unread && 'is-unread', row.selected && 'is-selected'].filter(Boolean).join(' ')
  return html`<div class="${cls}"><span class="pmark">${icon('mail')}</span><div class="mrow-main"><div class="mrow-top"><span class="mrow-sender">${row.sender}</span><span class="spec ellipsis">Gmail</span></div><span class="mrow-subject ellipsis">${row.subject}</span><span class="mrow-preview ellipsis">${row.preview}</span>${row.flag ? html`<span class="mrow-flag">${icon(row.flag.icon)}${row.flag.text}</span>` : ''}</div><div class="mrow-meta"><span class="spec${row.unread || row.selected ? ' c-text' : ''}">${row.time}</span>${row.count ? html`<span class="badge badge-solid">${row.count}</span>` : ''}</div></div>`
}

function hero(ctx: SiteContext): Html {
  return html`<section class="lp-hero" id="dau-trang" aria-label="Giới thiệu">
<div class="lp-hero-copy">
<span class="t-mono c-muted anim-enter d1">HỘP THƯ CHUNG · VIỆC CẦN LÀM</span>
<h1 class="lp-h1 anim-enter d1">Mọi hộp thư Gmail ở một nơi. Việc cần làm ngay bên cạnh.</h1>
<p class="lp-lead anim-enter d2">Sino gom các tài khoản Gmail của bạn vào một hộp thư chung. Đọc, trả lời và ghi việc cần làm ở cùng một chỗ, không phải mở từng tài khoản. Zalo, Messenger và Telegram sẽ đến sau.</p>
<div class="lp-cta anim-enter d2"><a class="btn btn-primary" href="${ctx.appHref('/')}">Mở Sino${icon('chevronRight')}</a><a class="btn btn-secondary" href="#cach-hoat-dong">Xem cách hoạt động</a></div>
<div class="lp-trust anim-enter d3"><span class="meta">${icon('lock')}Token được mã hóa trước khi lưu</span><span class="meta">${icon('eye')}Chỉ xin quyền đọc và gửi thư</span><span class="meta">${icon('key')}Thu hồi quyền bất cứ lúc nào</span></div>
</div>
<div class="lp-shot anim-enter d3" role="img" aria-label="Ảnh minh họa hộp thư chung của Sino với thư từ hai tài khoản Gmail, một việc cần làm và một thư trả lời đã gửi">
<div class="lp-shot-bar"><span></span><span></span><span></span><span class="spec">HỘP THƯ CHUNG · 2 TÀI KHOẢN GMAIL</span></div>
${mailRow({ sender: 'Trần Minh Anh', subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2', preview: 'Anh xem giúp và phản hồi trước thứ Tư 07/10 nhé.', time: '09:41', selected: true, flag: { icon: 'reply', text: 'Cần trả lời' } })}
${mailRow({ sender: 'Phòng khám Ánh Dương', subject: 'Lịch khám thứ Hai 05/10', preview: 'Quý khách có lịch khám lúc 08:30.', time: '08:15', unread: true, count: 2 })}
${mailRow({ sender: 'Nguyễn Thị Hoa', subject: 'Cuối tuần cả nhà về ăn cơm', preview: 'Nhớ mua bánh bông lan trứng muối cho bà nhé con.', time: '07:30', unread: true })}
${mailRow({ sender: 'Lê Hoàng', subject: 'File thiết kế bản cuối', preview: 'Mình gửi kèm file, bạn xem rồi góp ý nhé.', time: 'Hôm qua' })}
<div class="lp-float is-chip"><span class="lchip">${icon('checkSquare')}<span>Gửi lại hợp đồng</span><span class="spec">hạn T4 07/10</span></span></div>
<div class="lp-float is-note"><div class="nitem"><span class="n-ic">${icon('reply')}</span><div class="nitem-main"><span class="t-small t-strong">Đã trả lời Trần Minh Anh</span><span class="spec">TRONG CÙNG CHUỖI THƯ · 09:52</span></div><span></span></div></div>
</div>
</section>`
}

function strip(): Html {
  const providers: [string, IconName, boolean][] = [
    ['Gmail', 'mail', false],
    ['Zalo', 'zalo', true],
    ['Messenger', 'messenger', true],
    ['Telegram', 'telegram', true],
  ]
  return html`<div class="lp-strip" aria-label="Dịch vụ kết nối được">
<span class="micro-label">KẾT NỐI VỚI</span>
<div class="lp-strip-items">${providers.map(([name, ic, soon]) => html`<span class="lp-prov${soon ? ' is-soon' : ''}"><span class="pmark-sm">${icon(ic)}</span>${name}${soon ? soonBadge : ''}</span>`)}</div>
</div>`
}

function features(): Html {
  return html`<section class="lp-sec" id="tinh-nang" aria-labelledby="h-tinh-nang">
<div class="lp-sec-head"><span class="t-mono c-muted">TÍNH NĂNG</span><h2 class="lp-h2" id="h-tinh-nang">Một hộp thư làm được nhiều hơn đọc thư.</h2><p class="lp-lead">Mỗi tài khoản vẫn là của bạn. Sino chỉ bỏ đi việc phải mở từng hộp thư để biết ai đang chờ mình.</p></div>
<div class="bento">
<article class="card-spotlight lp-card is-wide is-tall"><span class="lp-fic">${icon('inbox')}</span><div class="lp-card-copy"><h3 class="t-large">Hộp thư hợp nhất</h3><p>Thư từ mọi tài khoản Gmail của bạn xếp chung theo thời gian, mỗi dòng ghi rõ tài khoản nhận. Lọc thư chưa đọc, thư cần trả lời hay thư đã lưu trữ.</p></div><div class="lp-mini">
${mailRow({ sender: 'Trần Minh Anh', subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2', preview: 'Anh xem giúp và phản hồi trước thứ Tư nhé.', time: '09:41', unread: true })}
${mailRow({ sender: 'Phòng khám Ánh Dương', subject: 'Lịch khám thứ Hai 05/10', preview: 'Quý khách có lịch khám lúc 08:30.', time: '08:15', unread: true, count: 2 })}
${mailRow({ sender: 'Lê Hoàng', subject: 'File thiết kế bản cuối', preview: 'Mình gửi kèm file, bạn xem rồi góp ý nhé.', time: 'Hôm qua' })}
</div></article>
<article class="card-bento lp-card is-half"><span class="lp-fic">${icon('refresh')}</span><div class="lp-card-copy"><h3 class="t-large">Thư mới tự hiện</h3><p>Có thư mới là hộp thư cập nhật ngay, không cần tải lại trang. Lỗi của từng tài khoản hiện đúng chỗ.</p></div><span class="status"><span class="dot dot-ok"></span>Đang nhận thư mới</span></article>
<article class="card-bento lp-card is-half"><span class="lp-fic">${icon('reply')}</span><div class="lp-card-copy"><h3 class="t-large">Trả lời ngay trong Sino</h3><p>Thư trả lời đi từ đúng tài khoản đã nhận và nằm trong đúng chuỗi thư. Mạng chập chờn cũng không làm thư gửi hai lần.</p></div><span class="sched-chip">${icon('check')}Đã gửi · 09:52</span></article>
<article class="card-bento lp-card is-third"><span class="lp-fic">${icon('eye')}</span><div class="lp-card-copy"><h3 class="t-large">Đọc thư an toàn</h3><p>Thư HTML hiện trong một khung cách ly. Ảnh trong thư chỉ tải khi bạn bấm Hiện ảnh, để người gửi không biết bạn đã mở thư.</p></div></article>
<article class="card-bento lp-card is-third"><span class="lp-fic">${icon('checkSquare')}</span><div class="lp-card-copy"><h3 class="t-large">Việc cần làm</h3><p>Mỗi việc có hạn, giờ, lặp lại và ghi chú. Việc quá hạn được nêu rõ, việc lặp tự sang lần kế tiếp.</p></div><span class="meta">${icon('repeat')}Mỗi thứ Hai</span></article>
<article class="card-bento lp-card is-third is-soon"><span class="lp-fic">${icon('calendar')}</span><div class="lp-card-copy"><h3 class="t-large">Lịch hẹn và ghi chú ${soonBadge}</h3><p>Lịch hẹn lặp lại và ghi chú gắn với một thư, ở cùng chỗ với hộp thư.</p></div></article>
</div>
</section>`
}

function planning(ctx: SiteContext): Html {
  const tasks: { when: string; title: string; note?: Html; over?: boolean }[] = [
    { when: '30/09', title: 'Gửi lại hóa đơn tháng 9 cho kế toán', note: html`<span class="t-small ink-err">Quá hạn 2 ngày</span>`, over: true },
    { when: '16:00', title: 'Gọi Minh Anh về phụ lục giá' },
    { when: '17:00', title: 'Chuyển tiền nhà tháng 10', note: html`<span class="meta">${icon('repeat')}Hằng tháng</span>` },
    { when: '18:00', title: 'Mua bánh bông lan trứng muối cho bà' },
  ]
  return html`<section class="lp-sec" id="ke-hoach" aria-labelledby="h-ke-hoach">
<div class="lp-split">
<div class="lp-split-copy">
<div class="lp-sec-head"><span class="t-mono c-muted">KẾ HOẠCH</span><h2 class="lp-h2" id="h-ke-hoach">Việc cần làm ở ngay cạnh hộp thư.</h2></div>
<ul class="lp-points">
<li>${icon('check')}<span>Việc gọn: hạn, giờ, lặp lại, ghi chú. Không biến thành một ứng dụng quản lý dự án.</span></li>
<li>${icon('check')}<span>Lặp hằng ngày, hằng tuần, hằng tháng hay hằng năm, tính theo giờ Việt Nam.</span></li>
<li>${icon('check')}<span>Mọi thứ nằm trong Sino; không cần đồng bộ sang ứng dụng khác.</span></li>
<li class="is-soon">${icon('plus')}<span>Tạo việc, lịch hẹn và ghi chú ngay từ một thư, bấm là về đúng thư gốc. ${soonBadge}</span></li>
</ul>
<a class="btn btn-secondary lp-start" href="${ctx.appHref('/tasks')}">Mở Việc cần làm${icon('chevronRight')}</a>
</div>
<article class="card-bento lp-today">
<div class="card-head"><span class="micro-label">Hôm nay · Thứ Sáu 02/10</span><span class="spec">4 việc</span></div>
<div class="lp-today-rows">${tasks.map((t) => html`<div class="td-row${t.over ? ' is-over' : ''}"><span class="spec c-text">${t.when}</span>${icon('checkSquare')}<div class="who-text"><span class="t-small t-strong ellipsis">${t.title}</span>${t.note ?? ''}</div><span></span></div>`)}</div>
</article>
</div>
</section>`
}

function howItWorks(): Html {
  const steps: [string, string, string][] = [
    ['01', 'Kết nối Gmail', 'Sino cho bạn xem lại từng quyền nó xin, rồi chuyển sang trang đăng nhập chính thức của Google. Mật khẩu Gmail không đi qua Sino.'],
    ['02', 'Sino nhập thư', 'Bạn chọn nhập 30 ngày, 90 ngày hay cả hộp thư. Sau đó thư mới tự hiện, không cần tải lại trang.'],
    ['03', 'Trả lời và lên việc', 'Trả lời ngay trong Sino, và ghi việc cần làm với hạn, giờ và lặp lại.'],
  ]
  return html`<section class="lp-sec" id="cach-hoat-dong" aria-labelledby="h-cach">
<div class="lp-sec-head"><span class="t-mono c-muted">CÁCH HOẠT ĐỘNG</span><h2 class="lp-h2" id="h-cach">Ba bước, vài phút.</h2></div>
<div class="lp-steps">${steps.map(([n, title, body]) => html`<article class="lp-step"><span class="lp-step-num">${n}</span><h3 class="t-large">${title}</h3><p class="lp-step-body">${body}</p></article>`)}</div>
</section>`
}

function privacy(): Html {
  const items: [IconName, string, string][] = [
    ['lock', 'Thông tin đăng nhập được mã hóa', 'Token Google của từng tài khoản được mã hóa AES-256-GCM trước khi lưu; khóa mã hóa được giữ tách khỏi cơ sở dữ liệu.'],
    ['eye', 'Chỉ xin quyền cần dùng', 'Sino đọc thư và gửi thư trả lời. Sino không xin quyền xóa thư, đổi cài đặt Gmail hay đọc danh bạ.'],
    ['checkSquare', 'Bạn xem quyền trước khi đồng ý', 'Sino liệt kê quyền nó xin trước khi chuyển bạn sang Google, và Google hỏi lại trên trang đồng ý của chính Google.'],
    ['key', 'Thu hồi bất cứ lúc nào', 'Ngắt kết nối trong Sino thì quyền bị thu hồi ở Google và token bị xóa khỏi Sino.'],
  ]
  const scopes: [string, string, string][] = [
    ['openid', 'Xác nhận tài khoản Google', 'Biết chắc tài khoản vừa kết nối là tài khoản Google nào, để không kết nối một tài khoản hai lần.'],
    ['email', 'Địa chỉ email', 'Ghi địa chỉ Gmail cạnh mỗi thư, để bạn biết thư đến tài khoản nào.'],
    ['gmail.readonly', 'Đọc thư', 'Đọc thư và tệp đính kèm để hiện trong hộp thư chung của bạn. Quyền này không cho Sino xóa hay sửa thư trong Gmail.'],
    ['gmail.send', 'Gửi thư', 'Gửi thư trả lời khi bạn bấm Gửi trong Sino. Sino không tự gửi thư nào.'],
  ]
  return html`<section class="lp-sec" id="rieng-tu" aria-labelledby="h-rieng-tu">
<div class="lp-sec-head"><span class="t-mono c-muted">QUYỀN RIÊNG TƯ</span><h2 class="lp-h2" id="h-rieng-tu">Riêng tư là mặc định, không phải một tùy chọn.</h2></div>
<div class="lp-priv">${items.map(([ic, title, body]) => html`<div class="lp-priv-item"><span class="lp-fic">${icon(ic)}</span><div class="lp-card-copy"><h3 class="t-large">${title}</h3><p>${body}</p></div></div>`)}</div>
<div class="lp-scopes" aria-labelledby="h-quyen-google">
<div class="lp-sec-head"><span class="t-mono c-muted">QUYỀN GOOGLE</span><h3 class="t-large" id="h-quyen-google">Sino xin gì từ tài khoản Google của bạn, và để làm gì.</h3></div>
<dl class="lp-scope-list">${scopes.map(([scope, name, reason]) => html`<div class="lp-scope"><dt><code class="t-mono">${scope}</code><span>${name}</span></dt><dd>${reason}</dd></div>`)}</dl>
<p class="lp-scope-note">Việc Sino sử dụng và chuyển giao thông tin nhận được từ Google API tuân thủ Chính sách dữ liệu người dùng của Dịch vụ API Google (Google API Services User Data Policy), bao gồm các yêu cầu Sử dụng giới hạn (Limited Use). <a class="lp-inline" href="/privacy#google">Đọc thêm trong Chính sách quyền riêng tư</a></p>
</div>
</section>`
}

function faq(): Html {
  const questions: [string, string][] = [
    ['Sino hỗ trợ những dịch vụ nào?', 'Hiện tại là Gmail, nhiều tài khoản cùng lúc. Zalo, Messenger và Telegram sẽ được thêm dần. Với mỗi dịch vụ, Sino chỉ hiện những thao tác dịch vụ đó cho phép.'],
    ['Sino có dùng thư của tôi để quảng cáo hay huấn luyện AI không?', 'Không. Thư chỉ dùng để hiện trong Sino của bạn và để gửi thư trả lời bạn viết. Sino không bán dữ liệu, không quảng cáo và không dùng thư để huấn luyện mô hình AI.'],
    ['Ngắt kết nối thì thư đã lưu có bị xóa không?', 'Ngắt kết nối thu hồi quyền ở Google ngay và xóa token. Thư đã lưu được giữ lại nhưng không hiện nữa, để kết nối lại không phải nhập lại từ đầu. Muốn xóa hẳn, hãy gửi yêu cầu theo cách ghi trong Chính sách quyền riêng tư.'],
    ['Nếu gửi thư bị lỗi giữa chừng thì sao?', 'Sino không bao giờ tự gửi lại khi không chắc thư đã đi hay chưa, để người nhận không nhận hai lần. Thư được giữ lại, kèm nút Gửi lại hoặc Bỏ.'],
    ['Lịch của Sino có đồng bộ với Google Calendar không?', 'Không. Sino không xin quyền Google Calendar. Lịch hẹn đang được làm và sẽ nằm trong Sino.'],
    ['Có ứng dụng cho điện thoại không?', 'Bạn dùng Sino trên trình duyệt của điện thoại; giao diện tự xếp lại theo màn hình. Ứng dụng riêng sẽ có sau.'],
  ]
  return html`<section class="lp-sec" id="cau-hoi" aria-labelledby="h-cau-hoi">
<div class="lp-sec-head"><span class="t-mono c-muted">CÂU HỎI THƯỜNG GẶP</span><h2 class="lp-h2" id="h-cau-hoi">Trước khi bắt đầu.</h2></div>
<div class="lp-faq">${questions.map(([q, a], i) => html`<details class="lp-qa"${i === 0 ? html` open` : ''}><summary class="lp-q">${q}${icon('plus')}</summary><p class="lp-a">${a}</p></details>`)}</div>
</section>`
}

function band(ctx: SiteContext): Html {
  return html`<section class="lp-band" aria-label="Bắt đầu">
<div class="lp-band-copy"><h2 class="lp-h2">Bớt mở từng hộp thư. Bớt quên việc.</h2><p class="lp-lead">Kết nối tài khoản Gmail đầu tiên và xem hộp thư chung của bạn sau vài phút.</p></div>
<div class="lp-cta"><a class="btn btn-primary" href="${ctx.appHref('/')}">Mở Sino${icon('chevronRight')}</a><a class="btn btn-secondary" href="${ctx.appHref('/login')}">Đăng nhập</a></div>
</section>`
}
