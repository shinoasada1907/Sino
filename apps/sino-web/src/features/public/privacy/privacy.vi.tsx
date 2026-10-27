// Copied from apps/sino-site/src/pages/privacy/privacy.vi.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { OwnerValue } from './OwnerValue'
import { A, Note, P, Summary, Ul, type PolicyDoc } from './PolicyPage'
import { GOOGLE_APP_NAME, LIMITED_USE, POLICY_URL, SCOPES } from './privacy.shared'

/**
 * The privacy policy in Vietnamese (SI-03). Every statement was checked against the code on 2026-10-13; read SI-03 in
 * tasks.md before changing one. The English version (privacy.en.tsx) keeps the same sections.
 */
export const PRIVACY_VI: PolicyDoc = {
  label: 'PHÁP LÝ',
  title: 'Chính sách quyền riêng tư',
  effective: 'HIỆU LỰC TỪ',
  lead: 'Sino lưu gì, dùng để làm gì, ai được xem, giữ bao lâu, và bạn kiểm soát dữ liệu của mình thế nào.',
  toc: 'Mục lục',
  sections: [
    {
      id: 'tom-tat',
      title: 'Tóm tắt',
      body: (
        <Summary
          items={[
            {
              title: 'Chỉ để hiện thư của bạn',
              body: `Thư của bạn chỉ dùng để hiện trong ${GOOGLE_APP_NAME} và để gửi thư trả lời do chính bạn viết.`,
            },
            {
              title: 'Không quảng cáo, không bán',
              body: 'Sino không bán dữ liệu, không dùng cho quảng cáo và không dùng để huấn luyện mô hình AI.',
            },
            {
              title: 'Bạn rút quyền lúc nào cũng được',
              body: 'Ngắt kết nối trong Sino hoặc ở trang quyền của tài khoản Google; muốn xóa hẳn thì gửi email cho Sino.',
            },
          ]}
        />
      ),
    },
    {
      id: 'pham-vi',
      title: 'Chính sách này áp dụng cho ai',
      body: (
        <>
          <P>
            Chính sách này áp dụng cho site này và cho các ứng dụng của Sino. Hiện Sino có một ứng dụng: {GOOGLE_APP_NAME},
            một hộp thư chung cho các tài khoản Gmail của bạn, kèm việc cần làm. Các mục dưới đây nói về dữ liệu của{' '}
            {GOOGLE_APP_NAME}. Khi có ứng dụng mới, chính sách sẽ có thêm phần cho ứng dụng đó.
          </P>
          {/* Not the words of sino-site: there the pages are a static site with no cookie (D-316). */}
          <P>
            Trang giới thiệu và trang chính sách nằm ngay trong ứng dụng. Chúng không đo lượt truy cập và không tải phông
            chữ, ảnh hay mã nào từ dịch vụ khác. Khi mở trang giới thiệu, Sino hỏi máy chủ xem bạn đã đăng nhập chưa; lần hỏi
            đó có thể đặt cookie chống giả mạo yêu cầu, một trong các cookie của ứng dụng ở mục{' '}
            <A href="#thu-thap">Dữ liệu Sino lưu</A>.
          </P>
        </>
      ),
    },
    {
      id: 'thu-thap',
      title: 'Dữ liệu Sino lưu',
      body: (
        <Ul>
          <li>
            <b>Tài khoản Sino:</b> email và tên hiển thị của bạn. Mật khẩu không được lưu ở dạng đọc được; Sino chỉ giữ bản
            băm BCrypt của nó.
          </li>
          <li>
            <b>Tài khoản Gmail bạn kết nối:</b> địa chỉ Gmail, mã định danh tài khoản Google, các quyền bạn đã cấp, cùng token
            truy cập và token làm mới mà Google cấp. Token được mã hóa trước khi lưu.
          </li>
          <li>
            <b>Thư:</b> tiêu đề, nội dung (dạng chữ và HTML), người gửi, người nhận, thời gian, trạng thái đã đọc và chuỗi thư
            mà thư thuộc về. Với tệp đính kèm, Sino chỉ lưu tên, loại và dung lượng; nội dung tệp được lấy từ Gmail mỗi lần
            bạn mở và không được lưu lại.
          </li>
          <li>
            <b>Trạng thái đồng bộ:</b> mốc đồng bộ gần nhất với Gmail, thời điểm và lỗi nếu có, để biết cần lấy thêm thư nào.
          </li>
          <li>
            <b>Dữ liệu bạn tạo:</b> việc cần làm (tiêu đề, ghi chú, hạn và cách lặp lại).
          </li>
          <li>
            <b>Cookie của ứng dụng:</b> cookie phiên đăng nhập, cookie chống giả mạo yêu cầu, và cookie “ghi nhớ đăng nhập”
            trong 30 ngày nếu bạn chọn. Sino không dùng cookie quảng cáo hay theo dõi.
          </li>
        </Ul>
      ),
    },
    {
      id: 'su-dung',
      title: 'Sino dùng dữ liệu để làm gì',
      body: (
        <>
          <Ul>
            <li>Hiện hộp thư chung, các chuỗi thư và tệp đính kèm của bạn.</li>
            <li>Cập nhật hộp thư khi có thư mới.</li>
            <li>Gửi thư trả lời từ đúng tài khoản Gmail đã nhận thư, chỉ khi bạn bấm Gửi. Sino không tự gửi thư nào.</li>
            <li>Lưu và hiện việc cần làm của bạn.</li>
            <li>Giữ tài khoản an toàn, ví dụ khóa đăng nhập 15 phút sau 5 lần nhập sai mật khẩu liên tiếp.</li>
          </Ul>
          <P>
            Sino không dùng dữ liệu của bạn cho quảng cáo, không bán, không cho thuê, và không dùng để huấn luyện mô hình AI
            hay học máy.
          </P>
        </>
      ),
    },
    {
      id: 'nguoi-xem',
      title: 'Ai được xem dữ liệu của bạn',
      body: (
        <>
          <P>Không ai đọc thư của bạn, trừ khi:</P>
          <Ul>
            <li>bạn đồng ý cho một thư cụ thể, ví dụ khi bạn gửi thư đó kèm lời báo lỗi;</li>
            <li>cần để bảo đảm an ninh, như điều tra lạm dụng hay một lỗ hổng;</li>
            <li>pháp luật bắt buộc.</li>
          </Ul>
          <P>
            Người vận hành Sino chỉ xem được số liệu và trạng thái để giữ dịch vụ chạy: email tài khoản Sino, địa chỉ Gmail
            đã kết nối, trạng thái kết nối và đồng bộ, mã lỗi, số thư đã lưu. Công cụ vận hành không bao giờ hiện tiêu đề, nội
            dung, người gửi, người nhận hay tệp đính kèm của thư.
          </P>
        </>
      ),
    },
    {
      id: 'ben-thu-ba',
      title: 'Bên thứ ba',
      body: (
        <>
          <Ul>
            <li>
              <b>Google:</b> Sino gọi Gmail API trong phạm vi quyền bạn cấp, để đọc và gửi thư. Để biết khi nào có thư mới,
              Gmail gửi thông báo qua Google Cloud Pub/Sub; thông báo chỉ có địa chỉ Gmail và một mốc thay đổi, không có nội
              dung thư.
            </li>
            <li>
              <b>Nhà cung cấp máy chủ:</b> <OwnerValue field="hosting" />. Dữ liệu của Sino được lưu ở đây.
            </li>
          </Ul>
          <P>Ngoài hai bên trên, Sino không chuyển dữ liệu của bạn cho ai, trừ khi pháp luật bắt buộc.</P>
        </>
      ),
    },
    {
      id: 'google',
      title: 'Dữ liệu nhận từ Google',
      body: (
        <>
          <P>Khi bạn kết nối Gmail, {GOOGLE_APP_NAME} xin bốn quyền:</P>
          <Ul>
            {SCOPES.map((s) => (
              <li key={s.scope}>
                <code className="rounded-xs border border-border-strong bg-raised px-1.5 py-0.5 font-mono text-[13px]">
                  {s.scope}
                </code>{' '}
                {s.vi}
              </li>
            ))}
          </Ul>
          <blockquote lang="en" className="border-l-2 border-border-strong pl-4">
            <P>{LIMITED_USE}</P>
          </blockquote>
          <P>
            Nghĩa là: việc {GOOGLE_APP_NAME} sử dụng và chuyển giao cho ứng dụng khác thông tin nhận được từ Google API tuân
            thủ <A href={POLICY_URL}>Chính sách dữ liệu người dùng của Dịch vụ API Google</A> (Google API Services User Data
            Policy), bao gồm các yêu cầu Sử dụng giới hạn (Limited Use). Cụ thể:
          </P>
          <Ul>
            <li>Dữ liệu Gmail chỉ dùng để hiện thư và gửi thư trả lời trong {GOOGLE_APP_NAME}, những tính năng bạn thấy trên màn hình.</li>
            <li>Sino không dùng dữ liệu Gmail cho quảng cáo, kể cả quảng cáo nhắm theo từng người, và không bán dữ liệu đó.</li>
            <li>Sino không dùng dữ liệu Gmail để huấn luyện mô hình AI hay học máy.</li>
            <li>Sino không dùng dữ liệu Gmail để đánh giá khả năng tín dụng hay cho vay.</li>
            <li>
              Không ai đọc dữ liệu Gmail của bạn, trừ các trường hợp ở mục <A href="#nguoi-xem">Ai được xem dữ liệu của bạn</A>.
            </li>
          </Ul>
        </>
      ),
    },
    {
      id: 'luu-giu',
      title: 'Lưu giữ và xóa',
      body: (
        <Ul>
          <li>Dữ liệu được giữ khi tài khoản Sino và tài khoản Gmail còn kết nối.</li>
          <li>
            Khi bạn ngắt kết nối một tài khoản Gmail, Sino thu hồi quyền ở Google ngay và xóa hẳn token khỏi Sino. Thư đã lưu
            được giữ lại nhưng không còn hiện trong hộp thư, để nếu bạn kết nối lại thì không phải nhập lại từ đầu.
          </li>
          <li>Việc cần làm được giữ tới khi bạn xóa chúng.</li>
          <li>
            Muốn xóa hẳn mọi dữ liệu của bạn, kể cả thư đã lưu, hãy gửi email tới <OwnerValue field="contactEmail" />. Sino
            xóa trong vòng 30 ngày kể từ khi nhận yêu cầu và báo lại cho bạn khi đã xóa xong.
          </li>
        </Ul>
      ),
    },
    {
      id: 'bao-mat',
      title: 'Bảo mật',
      body: (
        <>
          <Ul>
            <li>Token của Google được mã hóa AES-256-GCM trước khi lưu; khóa mã hóa được giữ tách khỏi cơ sở dữ liệu.</li>
            <li>Mật khẩu Sino chỉ được giữ dưới dạng băm BCrypt.</li>
            <li>Bạn kết nối Gmail trên trang đăng nhập của chính Google; mật khẩu Gmail không đi qua Sino.</li>
            <li>Thư HTML hiện trong một khung cách ly không chạy mã; ảnh trong thư chỉ tải khi bạn bấm Hiện ảnh.</li>
          </Ul>
          <P>
            {/* No link in sino-web: the Bảo mật page comes with SI-05 (D-311). */}
            Chi tiết ở trang Bảo mật.
          </P>
        </>
      ),
    },
    {
      id: 'quyen',
      title: 'Quyền của bạn',
      body: (
        <>
          <Ul>
            <li>Xem thư, tài khoản đã kết nối và việc cần làm của bạn ngay trong Sino.</li>
            <li>
              Ngắt kết nối từng tài khoản Gmail trong Sino, hoặc thu hồi quyền của Sino ở{' '}
              <A href="https://myaccount.google.com/permissions">trang quyền của tài khoản Google</A>.
            </li>
            <li>
              Hỏi Sino đang giữ dữ liệu gì về bạn, hoặc yêu cầu sửa hay xóa, qua email <OwnerValue field="contactEmail" />.
              Sino trả lời trong vòng 30 ngày.
            </li>
          </Ul>
          <Note>Sino xử lý dữ liệu cá nhân theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân.</Note>
        </>
      ),
    },
    {
      id: 'thay-doi',
      title: 'Thay đổi chính sách',
      body: (
        <P>
          Khi chính sách thay đổi, Sino cập nhật trang này và ngày hiệu lực ở đầu trang. Nếu thay đổi làm Sino dùng dữ liệu
          của bạn theo cách mới, Sino sẽ hỏi lại bạn trước khi áp dụng.
        </P>
      ),
    },
    {
      id: 'lien-he',
      title: 'Liên hệ',
      body: (
        <P>
          Chịu trách nhiệm về dữ liệu của Sino: <OwnerValue field="owner" /> · <OwnerValue field="contactEmail" />
        </P>
      ),
    },
  ],
}
