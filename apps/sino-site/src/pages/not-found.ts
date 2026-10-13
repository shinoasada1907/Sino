import type { SiteContext } from '../context.ts'
import { html } from '../html.ts'
import { icon } from '../icons.ts'
import type { PageSpec } from '../layout.ts'

/** Canvas `SiteNotFound`; static hosts answer unknown paths with 404.html. */
export function notFoundPage(ctx: SiteContext): PageSpec {
  return {
    path: '/404',
    file: '404.html',
    lang: 'vi',
    title: 'Không tìm thấy trang · Sino',
    description: 'Trang này không có trên site của Sino.',
    indexable: false,
    main: html`<section class="nf" aria-label="Không tìm thấy trang">
<span class="nf-code">404</span>
<h1 class="lp-h2">Không tìm thấy trang này.</h1>
<p class="lp-lead">Đường dẫn có thể đã đổi hoặc bị gõ nhầm. Thử về trang chủ hoặc mở thẳng Sino.</p>
<div class="lp-cta"><a class="btn btn-primary" href="/">${icon('chevronLeft')}Về trang chủ</a><a class="btn btn-secondary" href="${ctx.appHref('/')}">Mở Sino</a></div>
</section>`,
  }
}
