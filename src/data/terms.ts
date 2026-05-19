// src/data/terms.ts
// Nội dung điều khoản sử dụng – v1.0 – Bilingual (VI / EN)
// Để cập nhật nội dung: sửa file này rồi chạy `eas update`

export const TERMS_VERSION        = '1.0'
export const TERMS_EFFECTIVE_DATE = '2026'

export interface TermsSection {
  title: string
  items?: string[]
  body?:  string
}

export interface TermsPart {
  part:     string
  sections: TermsSection[]
}

// ─── TIẾNG VIỆT ─────────────────────────────────────────────────────────────

export const TERMS_OVERVIEW = `OpenDrive là nền tảng công nghệ kết nối cộng đồng theo mô hình P2P (ngang hàng), cho phép tài xế xe máy và khách hàng tự thỏa thuận, kết nối trực tiếp với nhau mà không qua trung gian tài chính.\n\nOpenDrive KHÔNG phải là hãng vận tải, KHÔNG phải là người sử dụng lao động của tài xế, và KHÔNG đứng giữa dòng tiền giao dịch giữa tài xế và khách hàng.\n\nBằng việc tải xuống, cài đặt hoặc sử dụng ứng dụng OpenDrive, bạn xác nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi toàn bộ các điều khoản trong tài liệu này.`

export const TERMS_PARTS: TermsPart[] = [
  {
    part: 'PHẦN 1: ĐIỀU KHOẢN CHUNG',
    sections: [
      {
        title: '1.1 Định Nghĩa',
        items: [
          '"OpenDrive" hoặc "Nền tảng": ứng dụng di động OpenDrive và các dịch vụ liên quan.',
          '"Người dùng": bất kỳ cá nhân nào cài đặt và sử dụng ứng dụng OpenDrive, bao gồm tài xế, khách hàng và thợ đào.',
          '"Tài xế": người dùng đăng ký cung cấp dịch vụ vận chuyển bằng xe máy hoặc ô tô.',
          '"Khách hàng": người dùng sử dụng dịch vụ kết nối để tìm tài xế.',
          '"Thợ đào": người dùng tham gia chương trình kiếm điểm ODC bằng cách xem quảng cáo.',
          '"ODC": điểm thưởng nội bộ của hệ sinh thái OpenDrive, không phải tiền tệ hay phương tiện thanh toán hợp pháp.',
          '"Blockchain Stellar": hệ thống lưu trữ bất biến dùng để ghi lịch sử hoạt động trong hệ sinh thái.',
        ],
      },
      {
        title: '1.2 Điều Kiện Sử Dụng',
        body:  'Để sử dụng OpenDrive, bạn phải:',
        items: [
          'Đủ 18 tuổi trở lên hoặc có sự đồng ý của người giám hộ hợp pháp.',
          'Cung cấp số điện thoại hợp lệ tại Việt Nam để xác thực.',
          'Đồng ý với Chính sách Bảo mật và Điều khoản Sử dụng này.',
          'Không vi phạm bất kỳ quy định pháp luật nào khi sử dụng dịch vụ.',
        ],
      },
      {
        title: '1.3 Thay Đổi Điều Khoản',
        body:  'OpenDrive có quyền cập nhật, sửa đổi các điều khoản này bất kỳ lúc nào. Thay đổi sẽ có hiệu lực ngay khi được đăng trên ứng dụng. Việc tiếp tục sử dụng dịch vụ sau khi có thay đổi đồng nghĩa với việc bạn chấp nhận các điều khoản mới.',
      },
      {
        title: '1.4 Chấm Dứt Tài Khoản',
        body:  'OpenDrive có quyền tạm ngưng hoặc chấm dứt tài khoản của bạn nếu phát hiện vi phạm các điều khoản này, hành vi gian lận, hoặc gây hại cho người dùng khác trong cộng đồng.',
      },
    ],
  },
  {
    part: 'PHẦN 2: ĐIỀU KHOẢN DÀNH CHO TÀI XẾ',
    sections: [
      {
        title: '2.1 Tư Cách Pháp Lý của Tài Xế',
        body:  'Tài xế tham gia OpenDrive với tư cách là cá nhân độc lập, không phải nhân viên, đại lý hay đối tác lao động của OpenDrive. OpenDrive không ký hợp đồng lao động hay hợp đồng hợp tác vận tải với tài xế.',
      },
      {
        title: '2.2 Trách Nhiệm Pháp Lý Của Tài Xế',
        body:  'Tài xế hoàn toàn và tự chịu trách nhiệm về:',
        items: [
          'Tuân thủ toàn bộ quy định pháp luật về giao thông đường bộ tại Việt Nam.',
          'Sở hữu bằng lái xe hợp lệ, phù hợp với loại phương tiện điều khiển.',
          'Đăng ký phương tiện đúng quy định, bao gồm đăng kiểm và đăng ký kinh doanh vận tải (nếu pháp luật yêu cầu).',
          'Mua bảo hiểm xe máy bắt buộc và các loại bảo hiểm phù hợp khác.',
          'Nộp thuế thu nhập cá nhân theo quy định nếu thu nhập vượt ngưỡng chịu thuế.',
          'Toàn bộ hành vi của mình trong quá trình thực hiện dịch vụ vận chuyển.',
        ],
      },
      {
        title: '2.3 Trách Nhiệm Khi Xảy Ra Tai Nạn',
        body:  'Trong trường hợp xảy ra tai nạn, va chạm, hoặc bất kỳ sự cố nào trong quá trình cung cấp dịch vụ:',
        items: [
          'Tài xế chịu toàn bộ trách nhiệm dân sự và hình sự theo quy định pháp luật.',
          'Bảo hiểm xe máy bắt buộc của tài xế là cơ chế bảo vệ chính.',
          'OpenDrive không chịu bất kỳ trách nhiệm pháp lý nào đối với thiệt hại phát sinh.',
          'OpenDrive không phải bên trong hợp đồng vận chuyển giữa tài xế và khách hàng.',
        ],
      },
      {
        title: '2.4 Điểm ODC và Ví Stellar',
        body:  'Khi đăng ký thành công, tài xế được cấp một ví Stellar cá nhân và nhận 100 ODC ban đầu. Về tính chất ODC:',
        items: [
          'ODC là điểm thưởng nội bộ, chỉ có giá trị trong hệ sinh thái OpenDrive.',
          'ODC KHÔNG phải tiền tệ, KHÔNG phải phương tiện thanh toán hợp pháp theo pháp luật Việt Nam.',
          'ODC dùng để trả phí ghi nhận chuyến xe lên blockchain (phí minh bạch hóa thu nhập).',
          'Tài xế có thể nhận ODC từ thợ đào thông qua giao dịch P2P trong cộng đồng.',
          'Ví Stellar gắn vĩnh viễn với tài khoản – một SĐT tương ứng một ví duy nhất.',
        ],
      },
      {
        title: '2.5 Cơ Chế Phạt',
        body:  'Tài xế chấp nhận các cơ chế phạt ODC sau khi đồng ý tham gia:',
        items: [
          'Hủy chuyến sau khi được khách chọn: phạt phí tương đương 3 lần phí ghi chuyến.',
          'Rating 2 sao: phạt thêm 1 lần phí ghi chuyến.',
          'Rating 1 sao: phạt thêm 2 lần phí ghi chuyến.',
          "Xóa app khi đang có chuyến dang dở (status 'busy'): tài khoản bị khóa 24 giờ.",
        ],
      },
      {
        title: '2.6 Quyền Của Tài Xế',
        items: [
          'Tự do chấp nhận hoặc từ chối bất kỳ cuộc xe nào.',
          'Tự do đặt giá cước cho từng chuyến xe.',
          'Tự do bật/tắt trạng thái sẵn sàng nhận cuộc bất kỳ lúc nào.',
          'Không bị ràng buộc về thời gian hoạt động hay doanh thu tối thiểu.',
          'Xem toàn bộ lịch sử giao dịch ODC của mình trên blockchain Stellar.',
        ],
      },
    ],
  },
  {
    part: 'PHẦN 3: ĐIỀU KHOẢN DÀNH CHO KHÁCH HÀNG',
    sections: [
      {
        title: '3.1 Bản Chất Dịch Vụ',
        body:  'OpenDrive cung cấp công cụ kết nối để khách hàng tìm tài xế độc lập. Hợp đồng vận chuyển được hình thành trực tiếp giữa khách hàng và tài xế, không qua OpenDrive.',
      },
      {
        title: '3.2 Thanh Toán',
        items: [
          'Khách hàng thanh toán trực tiếp cho tài xế bằng tiền mặt.',
          'OpenDrive không nhận, không giữ, và không xử lý bất kỳ khoản thanh toán nào.',
          'Giá cước do tài xế đề xuất – khách hàng có quyền chấp nhận hoặc từ chối.',
          'Không có phí nền tảng, phí dịch vụ hay bất kỳ khoản phụ thu nào từ OpenDrive.',
        ],
      },
      {
        title: '3.3 Cơ Chế Hủy Chuyến',
        body:  'Khách hàng có quyền hủy chuyến với điều kiện:',
        items: [
          'Hủy trước khi chọn tài xế: không phạt.',
          'Hủy sau khi chọn tài xế, trong 10 phút đầu kể từ khi tài xế chưa đến: không phạt.',
          'Hủy sau khi đã chọn tài xế (ngoài 10 phút): bị khóa 2 giờ (lần 1), 48 giờ (lần 2).',
          'Sau 2 lần vi phạm trong chu kỳ, tài khoản được reset về trạng thái bình thường.',
        ],
      },
      {
        title: '3.4 Trách Nhiệm Của Khách Hàng',
        items: [
          'Cung cấp thông tin vị trí đón/trả chính xác.',
          'Hành xử lịch sự, tôn trọng tài xế trong suốt hành trình.',
          'Không yêu cầu tài xế vi phạm luật giao thông.',
          'Chịu trách nhiệm về hành vi của mình trong suốt thời gian sử dụng dịch vụ.',
        ],
      },
      {
        title: '3.5 Giới Hạn Trách Nhiệm',
        body:  'OpenDrive không chịu trách nhiệm về: chất lượng dịch vụ của tài xế; tai nạn, sự cố xảy ra trong hành trình; tranh chấp về giá cước; tài sản bị thất lạc trên xe. Các tranh chấp giữa tài xế và khách hàng được giải quyết trực tiếp giữa 2 bên theo quy định pháp luật dân sự.',
      },
    ],
  },
  {
    part: 'PHẦN 4: ĐIỀU KHOẢN DÀNH CHO THỢ ĐÀO',
    sections: [
      {
        title: '4.1 Chương Trình Kiếm Điểm ODC',
        body:  'Thợ đào kiếm điểm ODC bằng cách xem quảng cáo hợp pháp trong ứng dụng. Đây là chương trình khuyến mãi cộng đồng, không phải hoạt động đầu tư hay kinh doanh.',
      },
      {
        title: '4.2 Quy Tắc Đào Coin',
        items: [
          'Tối đa 3 phiên đào mỗi ngày, mỗi phiên tối đa 100 lượt xem quảng cáo.',
          'Phiên đào chỉ được tính nếu hoàn thành tối thiểu 10 lượt xem.',
          "Điểm trong phiên đào lưu tạm thời – nếu tắt app trước khi bấm 'Dừng đào' thì mất điểm phiên đó.",
          'Mỗi lượt xem quảng cáo hoàn chỉnh mới được tính điểm – không được tắt quảng cáo giữa chừng.',
        ],
      },
      {
        title: '4.3 Đổi Điểm ODC',
        items: [
          'Tối thiểu 10 điểm mới được đổi sang ví Stellar của tài xế.',
          'Phí đổi điểm: 0.1 ODC/lần đổi, chuyển vào Ví Phân Phối.',
          'Thợ đào tự chịu trách nhiệm cung cấp đúng địa chỉ ví Stellar khi đổi điểm.',
          'Giao dịch đổi điểm được ghi lên blockchain Stellar – không thể hoàn tác.',
        ],
      },
      {
        title: '4.4 Tính Chất Pháp Lý Của ODC',
        items: [
          'ODC là điểm thưởng nội bộ, không có giá trị pháp lý như tiền tệ.',
          'OpenDrive không cam kết bất kỳ mức giá hay tỷ giá quy đổi nào cho ODC.',
          'Việc trao đổi ODC giữa các thành viên cộng đồng là thỏa thuận dân sự giữa các cá nhân.',
          'Thợ đào tự chịu trách nhiệm về nghĩa vụ thuế nếu phát sinh từ hoạt động trao đổi ODC.',
        ],
      },
      {
        title: '4.5 Hành Vi Bị Cấm',
        items: [
          'Sử dụng bot, script, hay bất kỳ phương tiện tự động nào để kiếm điểm.',
          'Giả mạo lượt xem quảng cáo.',
          'Tạo nhiều tài khoản để lách giới hạn đào coin.',
          'Mọi hành vi gian lận sẽ dẫn đến khóa tài khoản vĩnh viễn và mất toàn bộ điểm tích lũy.',
        ],
      },
    ],
  },
  {
    part: 'PHẦN 5: BẢO VỆ DỮ LIỆU CÁ NHÂN',
    sections: [
      {
        title: '5.1 Dữ Liệu Thu Thập',
        body:  'OpenDrive thu thập các dữ liệu sau để cung cấp dịch vụ:',
        items: [
          'Số điện thoại: dùng để xác thực danh tính và liên lạc.',
          'Vị trí GPS: dùng để kết nối tài xế và khách hàng gần nhau (chỉ thu thập khi dùng app).',
          'Thông tin phương tiện (tài xế): tên, loại xe, biển số xe.',
          'Lịch sử hoạt động: được ghi lên blockchain Stellar – công khai và bất biến.',
        ],
      },
      {
        title: '5.2 Cách Sử Dụng Dữ Liệu',
        items: [
          'Cung cấp và cải thiện dịch vụ kết nối.',
          'Ngăn chặn gian lận và bảo vệ cộng đồng.',
          'Hiển thị quảng cáo phù hợp qua mạng AdMob của Google.',
          'OpenDrive KHÔNG bán dữ liệu cá nhân cho bên thứ ba.',
        ],
      },
      {
        title: '5.3 Vị Trí GPS – Lưu Ý Đặc Biệt',
        body:  'Vị trí GPS được truyền trực tiếp P2P giữa tài xế và khách hàng qua công nghệ WebRTC – không lưu trên server của OpenDrive. Sau khi chuyến kết thúc, dữ liệu vị trí không còn được lưu trữ ở đâu.',
      },
      {
        title: '5.4 Quyền Của Người Dùng',
        items: [
          'Quyền truy cập: xem dữ liệu cá nhân của mình bất kỳ lúc nào trong app.',
          'Quyền xóa: yêu cầu xóa tài khoản và dữ liệu cá nhân (lưu ý: dữ liệu đã ghi blockchain không thể xóa do tính chất bất biến).',
          'Quyền khiếu nại: liên hệ OpenDrive nếu cho rằng dữ liệu cá nhân bị xử lý sai.',
        ],
      },
      {
        title: '5.5 Bảo Mật Dữ Liệu',
        items: [
          'Private key ví Stellar được mã hóa AES-256-GCM – không ai trong OpenDrive có thể đọc được raw private key.',
          'Dữ liệu nhạy cảm lưu trong Secure Enclave của thiết bị (iOS Keychain / Android Keystore).',
          'Kết nối tài xế-khách hàng mã hóa end-to-end qua WebRTC DTLS.',
        ],
      },
    ],
  },
  {
    part: 'PHẦN 6: MIỄN TRỪ TRÁCH NHIỆM',
    sections: [
      {
        title: '6.1 Tính Chất Nền Tảng',
        body:  'OpenDrive là nền tảng công nghệ kết nối, tương tự như Zalo, Facebook Marketplace hay các chợ điện tử. OpenDrive không kiểm soát, không giám sát và không chịu trách nhiệm về:',
        items: [
          'Hành vi của tài xế hoặc khách hàng trước, trong và sau chuyến đi.',
          'Chất lượng, sự an toàn của dịch vụ vận chuyển.',
          'Tranh chấp phát sinh giữa tài xế và khách hàng.',
          'Thiệt hại về người, tài sản trong quá trình thực hiện dịch vụ.',
          'Tính chính xác của thông tin do người dùng cung cấp.',
        ],
      },
      {
        title: '6.2 Giới Hạn Bồi Thường',
        body:  'Trong mọi trường hợp, trách nhiệm pháp lý tối đa của OpenDrive không vượt quá tổng doanh thu quảng cáo phát sinh từ tài khoản của người dùng trong 3 tháng gần nhất.',
      },
      {
        title: '6.3 Bất Khả Kháng',
        body:  'OpenDrive không chịu trách nhiệm về gián đoạn dịch vụ do thiên tai, chiến tranh, quyết định của cơ quan nhà nước, sự cố hạ tầng Internet, hoặc các sự kiện ngoài tầm kiểm soát hợp lý.',
      },
    ],
  },
  {
    part: 'PHẦN 7: ĐIỀU KHOẢN CUỐI',
    sections: [
      {
        title: '7.1 Luật Áp Dụng',
        body:  'Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi tranh chấp phát sinh sẽ được giải quyết tại Tòa án nhân dân có thẩm quyền tại Việt Nam.',
      },
      {
        title: '7.2 Tính Hiệu Lực Từng Phần',
        body:  'Nếu bất kỳ điều khoản nào trong tài liệu này bị Tòa án tuyên vô hiệu, các điều khoản còn lại vẫn có hiệu lực đầy đủ.',
      },
      {
        title: '7.3 Toàn Bộ Thỏa Thuận',
        body:  'Tài liệu này cùng với Chính sách Bảo mật tạo thành toàn bộ thỏa thuận giữa người dùng và OpenDrive, thay thế mọi thỏa thuận trước đó.',
      },
      {
        title: '7.4 Liên Hệ',
        body:  'Mọi thắc mắc về Điều khoản Sử dụng, vui lòng liên hệ qua địa chỉ email hoặc kênh hỗ trợ trong ứng dụng OpenDrive.',
      },
    ],
  },
]

// ─── ENGLISH ─────────────────────────────────────────────────────────────────

export const TERMS_OVERVIEW_EN = `OpenDrive is a peer-to-peer (P2P) community technology platform that enables motorcycle and car drivers to negotiate and connect directly with customers — with no financial intermediary involved.\n\nOpenDrive is NOT a transport company, NOT an employer of drivers, and does NOT participate in any financial transaction between drivers and customers.\n\nBy downloading, installing, or using the OpenDrive application, you confirm that you have read, understood, and agree to be bound by all the terms in this document.`

export const TERMS_PARTS_EN: TermsPart[] = [
  {
    part: 'PART 1: GENERAL TERMS',
    sections: [
      {
        title: '1.1 Definitions',
        items: [
          '"OpenDrive" or "Platform": the OpenDrive mobile application and all related services.',
          '"User": any individual who installs and uses the OpenDrive app, including drivers, customers, and miners.',
          '"Driver": a user who registers to provide transportation services by motorcycle or car.',
          '"Customer": a user who uses the platform to find a driver.',
          '"Miner": a user who participates in the ODC reward program by watching advertisements.',
          '"ODC": an internal reward point within the OpenDrive ecosystem — not a currency or legal tender.',
          '"Stellar Blockchain": the immutable ledger used to record activity history within the ecosystem.',
        ],
      },
      {
        title: '1.2 Eligibility',
        body:  'To use OpenDrive, you must:',
        items: [
          'Be at least 18 years old, or have consent from a legal guardian.',
          'Provide a valid Vietnamese phone number for verification.',
          'Agree to this Privacy Policy and Terms of Service.',
          'Comply with all applicable laws when using the service.',
        ],
      },
      {
        title: '1.3 Changes to Terms',
        body:  'OpenDrive reserves the right to update or amend these terms at any time. Changes take effect immediately upon publication in the app. Continued use of the service after any changes constitutes your acceptance of the new terms.',
      },
      {
        title: '1.4 Account Termination',
        body:  'OpenDrive may suspend or terminate your account if violations of these terms, fraudulent behavior, or harm to other community members is detected.',
      },
    ],
  },
  {
    part: 'PART 2: DRIVER TERMS',
    sections: [
      {
        title: '2.1 Driver Legal Status',
        body:  'Drivers participate in OpenDrive as independent individuals — not as employees, agents, or labor partners of OpenDrive. OpenDrive does not enter into employment or transport partnership agreements with drivers.',
      },
      {
        title: '2.2 Driver Responsibilities',
        body:  'Drivers are fully and solely responsible for:',
        items: [
          'Complying with all Vietnamese road traffic laws and regulations.',
          'Holding a valid driver\'s license appropriate for the vehicle operated.',
          'Properly registering their vehicle, including vehicle inspection and transport business registration where required by law.',
          'Maintaining mandatory motorcycle/vehicle insurance and other appropriate coverage.',
          'Filing personal income tax if earnings exceed the taxable threshold.',
          'All conduct during the provision of transportation services.',
        ],
      },
      {
        title: '2.3 Accident Liability',
        body:  'In the event of an accident, collision, or any incident during service provision:',
        items: [
          'The driver bears full civil and criminal liability as provided by law.',
          'The driver\'s mandatory vehicle insurance is the primary protection mechanism.',
          'OpenDrive bears no legal liability for any resulting damages.',
          'OpenDrive is not a party to the transport contract between driver and customer.',
        ],
      },
      {
        title: '2.4 ODC Points & Stellar Wallet',
        body:  'Upon successful registration, drivers receive a personal Stellar wallet and 100 ODC as a welcome bonus. Regarding ODC:',
        items: [
          'ODC is an internal reward point, valid only within the OpenDrive ecosystem.',
          'ODC is NOT a currency and NOT legal tender under Vietnamese law.',
          'ODC is used to pay the fee for recording trips on the blockchain (income transparency fee).',
          'Drivers may receive ODC from miners through P2P transactions within the community.',
          'The Stellar wallet is permanently tied to the account — one phone number, one wallet.',
        ],
      },
      {
        title: '2.5 Penalty Mechanism',
        body:  'By agreeing to participate, drivers accept the following ODC penalty mechanisms:',
        items: [
          'Cancelling a trip after being selected by a customer: penalty of 3× the trip recording fee.',
          '2-star rating: additional penalty of 1× the trip recording fee.',
          '1-star rating: additional penalty of 2× the trip recording fee.',
          "Deleting the app while a trip is in progress (status 'busy'): account locked for 24 hours.",
        ],
      },
      {
        title: '2.6 Driver Rights',
        items: [
          'Freedom to accept or decline any ride request.',
          'Freedom to set your own fare for each trip.',
          'Freedom to toggle availability on or off at any time.',
          'No obligation regarding working hours or minimum earnings.',
          'Full access to your ODC transaction history on the Stellar blockchain.',
        ],
      },
    ],
  },
  {
    part: 'PART 3: CUSTOMER TERMS',
    sections: [
      {
        title: '3.1 Nature of Service',
        body:  'OpenDrive provides a connection tool for customers to find independent drivers. The transport agreement is formed directly between the customer and the driver — OpenDrive is not a party.',
      },
      {
        title: '3.2 Payment',
        items: [
          'Customers pay drivers directly in cash.',
          'OpenDrive does not receive, hold, or process any payments.',
          'Fares are proposed by drivers — customers have the right to accept or decline.',
          'There are no platform fees, service charges, or surcharges from OpenDrive.',
        ],
      },
      {
        title: '3.3 Cancellation Policy',
        body:  'Customers may cancel a trip under the following conditions:',
        items: [
          'Cancel before selecting a driver: no penalty.',
          'Cancel within 10 minutes of selecting a driver (before the driver arrives): no penalty.',
          'Cancel after selecting a driver (beyond 10 minutes): account locked 2 hours (1st offense), 48 hours (2nd offense).',
          'After 2 violations in a cycle, the account resets to normal status.',
        ],
      },
      {
        title: '3.4 Customer Responsibilities',
        items: [
          'Provide accurate pick-up and drop-off location information.',
          'Behave respectfully and courteously toward drivers throughout the journey.',
          'Do not ask drivers to violate traffic laws.',
          'Take responsibility for your conduct throughout the use of the service.',
        ],
      },
      {
        title: '3.5 Limitation of Liability',
        body:  'OpenDrive is not responsible for: driver service quality; accidents or incidents during the journey; fare disputes; or lost property in the vehicle. Disputes between drivers and customers are resolved directly between the parties in accordance with civil law.',
      },
    ],
  },
  {
    part: 'PART 4: MINER TERMS',
    sections: [
      {
        title: '4.1 ODC Reward Program',
        body:  'Miners earn ODC points by watching legitimate advertisements in the app. This is a community incentive program — not an investment or business activity.',
      },
      {
        title: '4.2 Mining Rules',
        items: [
          'Maximum 3 mining sessions per day, up to 100 ad views per session.',
          'A session is only counted if at least 10 ad views are completed.',
          "Points within a session are temporary — closing the app before tapping 'Stop Mining' forfeits that session's points.",
          'Only fully completed ad views are counted — skipping ads mid-way does not earn points.',
        ],
      },
      {
        title: '4.3 Redeeming ODC',
        items: [
          'A minimum of 10 points is required to redeem ODC to a driver\'s Stellar wallet.',
          'Redemption fee: 0.1 ODC per transaction, transferred to the Distribution Wallet.',
          'Miners are responsible for providing the correct Stellar wallet address at redemption.',
          'Redemption transactions are recorded on the Stellar blockchain and cannot be reversed.',
        ],
      },
      {
        title: '4.4 Legal Nature of ODC',
        items: [
          'ODC is an internal reward point with no legal monetary value.',
          'OpenDrive makes no commitment regarding any price or exchange rate for ODC.',
          'Exchanges of ODC between community members are civil agreements between individuals.',
          'Miners are responsible for any tax obligations arising from ODC exchange activities.',
        ],
      },
      {
        title: '4.5 Prohibited Conduct',
        items: [
          'Using bots, scripts, or any automated means to earn points.',
          'Faking or simulating ad views.',
          'Creating multiple accounts to circumvent mining limits.',
          'Any fraudulent behavior will result in permanent account suspension and forfeiture of all accumulated points.',
        ],
      },
    ],
  },
  {
    part: 'PART 5: PERSONAL DATA PROTECTION',
    sections: [
      {
        title: '5.1 Data We Collect',
        body:  'OpenDrive collects the following data to provide its services:',
        items: [
          'Phone number: used for identity verification and communication.',
          'GPS location: used to match nearby drivers and customers (collected only while using the app).',
          'Vehicle information (drivers): name, vehicle type, license plate.',
          'Activity history: recorded on the Stellar blockchain — public and immutable.',
        ],
      },
      {
        title: '5.2 How We Use Data',
        items: [
          'To provide and improve the connection service.',
          'To prevent fraud and protect the community.',
          'To display relevant advertisements via Google\'s AdMob network.',
          'OpenDrive does NOT sell personal data to third parties.',
        ],
      },
      {
        title: '5.3 GPS Location — Special Notice',
        body:  'GPS location is transmitted directly P2P between driver and customer via WebRTC technology — it is never stored on OpenDrive servers. Once a trip ends, location data is no longer retained anywhere.',
      },
      {
        title: '5.4 Your Rights',
        items: [
          'Right to access: view your personal data at any time within the app.',
          'Right to deletion: request account and personal data deletion (note: data already written to the blockchain cannot be deleted due to its immutable nature).',
          'Right to complaint: contact OpenDrive if you believe your personal data is being processed incorrectly.',
        ],
      },
      {
        title: '5.5 Data Security',
        items: [
          'Your Stellar wallet private key is encrypted with AES-256-GCM — no one at OpenDrive can read the raw private key.',
          'Sensitive data is stored in the device\'s Secure Enclave (iOS Keychain / Android Keystore).',
          'Driver-customer connections are end-to-end encrypted via WebRTC DTLS.',
        ],
      },
    ],
  },
  {
    part: 'PART 6: DISCLAIMER OF LIABILITY',
    sections: [
      {
        title: '6.1 Platform Nature',
        body:  'OpenDrive is a technology connection platform, similar to Zalo, Facebook Marketplace, or online marketplaces. OpenDrive does not control, monitor, or bear responsibility for:',
        items: [
          'The conduct of drivers or customers before, during, or after a trip.',
          'The quality or safety of transportation services.',
          'Disputes arising between drivers and customers.',
          'Personal injury or property damage during service delivery.',
          'The accuracy of information provided by users.',
        ],
      },
      {
        title: '6.2 Limitation of Compensation',
        body:  'In all cases, OpenDrive\'s maximum legal liability shall not exceed the total advertising revenue generated from your account over the preceding 3 months.',
      },
      {
        title: '6.3 Force Majeure',
        body:  'OpenDrive is not liable for service interruptions caused by natural disasters, war, government decisions, Internet infrastructure failures, or other events beyond reasonable control.',
      },
    ],
  },
  {
    part: 'PART 7: FINAL PROVISIONS',
    sections: [
      {
        title: '7.1 Governing Law',
        body:  'These terms are governed by the laws of Vietnam. Any disputes shall be resolved before the competent People\'s Court in Vietnam.',
      },
      {
        title: '7.2 Severability',
        body:  'If any provision of this document is declared void by a court, the remaining provisions shall remain in full force and effect.',
      },
      {
        title: '7.3 Entire Agreement',
        body:  'This document, together with the Privacy Policy, constitutes the entire agreement between users and OpenDrive, superseding all prior agreements.',
      },
      {
        title: '7.4 Contact',
        body:  'For any questions about these Terms of Service, please contact us via the email address or support channel within the OpenDrive app.',
      },
    ],
  },
]
