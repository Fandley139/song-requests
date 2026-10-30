// Page texts in English and Russian. t('key', { name }) fills {name} placeholders.

const en = {
  title: 'Song requests',
  subtitle: 'DonationAlerts donations → your Spotify queue',

  'notice.notConfigured': 'This page is not set up yet. The page owner needs to fill in config.js (see the README).',
  'notice.otherTab': 'This page is already open in another tab or window of this browser. Use that one, or close it and reload this page.',
  'notice.daConnected': 'DonationAlerts connected.',
  'notice.spConnected': 'Spotify connected.',
  'notice.cancelled': '{service} login was cancelled.',
  'notice.oldLink': 'That login link was out of date. Please try again.',
  'notice.obsImported': 'Logins and rules were loaded. This OBS panel now takes song requests.',
  'notice.loggedOut': 'Logged out on this device.',
  'notice.obsBad': 'This OBS link is damaged. Make a new one with "Move to OBS".',
  'notice.loginError': '{service} login failed: {error}.',
  'notice.close': 'Close',
  'fatal.config': 'config.js has a mistake, so the page cannot start ({message}). The page owner needs to fix it (see the README).',
  'lang.label': 'Language',

  'ready.yes': 'Ready — waiting for donations',
  'ready.no': 'Not ready yet',

  'row.da': 'DonationAlerts',
  'row.sp': 'Spotify',
  'row.player': 'Spotify player',

  'da.notConnected': 'Not connected',
  'da.connecting': 'Connecting…',
  'da.connected': 'Connected: {name}',
  'da.waiting': 'Connection problem. Retrying in {seconds} s…',
  'da.expired': 'Login expired. Connect again.',
  'da.otherTab': 'Running in another tab',

  'sp.notConnected': 'Not connected',
  'sp.checking': 'Checking…',
  'sp.connected': 'Connected: {name}',
  'sp.premium': 'Needs Spotify Premium.',
  'sp.sharedHint': 'Needs Spotify Premium. Before connecting, the page owner must add the email of your Spotify account to their Spotify app.',
  'sp.checkFailed': 'Could not check the connection',
  'sp.clientLabel': 'Your Spotify Client ID',
  'sp.clientInvalid': 'A Spotify Client ID is 32 letters and digits.',
  'sp.clientHow': 'How to get a Client ID (about 3 minutes)',
  'sp.clientStep1': 'Open developer.spotify.com/dashboard and log in with your Spotify Premium account.',
  'sp.clientStep2': 'Click "Create app". Name: Song requests. Description: Song requests from donations.',
  'sp.clientStep3': 'Redirect URIs: paste the address below and click "Add":',
  'sp.clientStep4': 'Tick "Web API", accept the terms, click "Save".',
  'sp.clientStep5': 'Open "Settings", copy the Client ID and paste it above. (You do not need the client secret.)',

  'player.needSpotify': 'Connect Spotify first',
  'player.checking': 'Looking for a player…',
  'player.none': 'No player found. Open Spotify on this computer or phone and press play once.',
  'player.ok': 'Found: {name}',
  'player.active': '{name} (active)',
  'player.error': 'Could not check: {message}',

  'btn.connectDa': 'Connect DonationAlerts',
  'btn.connectSp': 'Connect Spotify',
  'btn.reconnect': 'Connect again',
  'btn.check': 'Check again',
  'btn.dry': 'Check',
  'btn.queue': 'Add to queue',
  'btn.copy': 'Copy',
  'btn.copied': 'Copied',
  'btn.moveToObs': 'Move to OBS',
  'btn.logout': 'Log out on this device',

  'test.title': 'Try a song',
  'test.hint': 'Checks a song request without a donation. "Check" only shows what would be added.',
  'test.placeholder': 'Song name or Spotify link',
  'test.donor': 'Test',

  'activity.title': 'Activity',
  'activity.empty': 'Donations and tests will appear here.',
  'activity.test': 'test',
  'activity.anonymous': 'Anonymous',
  'status.queued': 'Queued',
  'status.dry-run': 'Would queue',
  'status.skipped': 'Skipped',
  'status.error': 'Problem',

  'sys.connected': 'Connected to DonationAlerts.',
  'sys.lost': 'Lost the connection to DonationAlerts.',
  'sys.waiting': 'Reconnecting in {seconds} s (attempt {attempt}).',
  'sys.expired': 'The DonationAlerts login has expired. Click "Connect again".',
  'sys.bad_message': 'Got a message from DonationAlerts that does not look like a donation: {sample}',
  'sys.spotify_busy': 'Spotify is busy. Waiting {seconds} s…',
  'sys.switch_device': 'No active Spotify player. Switching to "{name}"…',

  'reason.below_min': 'amount {amount} is below the minimum ({min})',
  'reason.no_request': 'no song link or song name in the message',
  'reason.unsupported_link': 'the link is not a single song (albums, playlists, artists and podcasts cannot be queued)',
  'reason.not_found': 'nothing found on Spotify for "{query}"',
  'reason.no_track_for_link': 'Spotify has no song for that link',
  'reason.explicit': 'marked explicit (blocked in the rules)',
  'reason.too_long': 'too long ({duration}, limit {max} min)',
  'reason.blocked_word': 'contains the blocked word "{word}"',
  'reason.blocked_artist': 'the artist "{artist}" is blocked',
  'reason.not_playable': 'not available in your Spotify country',
  'reason.none_passed': 'none of the {count} results passed the rules (first: {first}, {why})',
  'reason.duplicate': 'already queued {minutes} min ago (no repeats within {window} min)',

  'error.network': 'Could not reach {service}. Check the internet connection.',
  'error.network.relay': 'Could not reach the relay. Check the internet connection, or ask the page owner to check relayUrl in config.js.',
  'error.not_connected': '{service} is not connected.',
  'error.expired': 'The {service} login has expired. Connect it again.',
  'error.no_device': 'No Spotify player is open. Open Spotify on this computer or phone and press play once.',
  'error.premium': 'Spotify refused to add the song. It needs Spotify Premium, and this Spotify account must be allowed to use the Spotify app.',
  'error.spotify_forbidden': 'Spotify refused access. This Spotify account may not be allowed to use the Spotify app (the page owner can add it under User Management).',
  'error.rate_limit': 'Spotify is busy. Try again in about {minutes} min.',
  'error.spotify_server': 'Spotify had a server problem. Try again in a minute.',
  'error.spotify_bad_client': 'Spotify does not accept this Client ID. Check it, and that the Spotify app has this page as its redirect URI.',
  'error.login_failed': 'The login did not work. Please try again.',
  'error.da_timeout': 'DonationAlerts did not answer in time.',
  'error.connection_lost': 'The connection to DonationAlerts was lost.',

  'rules.title': 'Rules',
  'rules.minAmount': 'Minimum donation for a song',
  'rules.minAmountHint': 'In your DonationAlerts currency.',
  'rules.blockExplicit': 'Block explicit songs',
  'rules.maxTrackMinutes': 'Longest song allowed (minutes)',
  'rules.blockedWords': 'Blocked words',
  'rules.blockedWordsHint': 'One per line. Checked in the song title, the artists and the donor\'s message, also inside longer words.',
  'rules.blockedArtists': 'Blocked artists',
  'rules.blockedArtistsHint': 'One per line, written as Spotify shows the name.',
  'rules.duplicate': 'Do not repeat a song within (minutes)',
  'rules.duplicateHint': '0 turns this off.',
  'rules.saved': 'Saved. New rules apply right away.',

  'obs.title': 'Run inside OBS (recommended)',
  'obs.intro': 'In OBS, song requests keep working whenever OBS is open, and you can close this browser tab.',
  'obs.before': 'Clicking the button stops song requests in this browser (so songs are not added twice) and gives you a link for OBS.',
  'obs.after': 'Song requests stopped in this browser. Add the link below to OBS:',
  'obs.step1': 'In OBS, open the Docks menu → Custom Browser Docks… (older OBS: View → Docks → Custom Browser Docks…).',
  'obs.step2': 'Dock Name: Song requests. URL: paste the link. Click Apply.',
  'obs.step3': 'Keep the panel open while you stream. It can be small or share a tab with other panels.',
  'obs.warning': 'This link contains your logins. Do not share it or show it on stream.',
  'obs.needBoth': 'Connect DonationAlerts and Spotify first.',
  'obs.lost': 'Lost the link? Connect again here and click "Move to OBS" again.',

  'help.title': 'How viewers request songs',
  'help.text': 'Viewers put a Spotify song link or "Artist - Song" in the donation message.',
  'help.pageTextLabel': 'Text for your DonationAlerts page:',
  'help.pageText': 'To order a song, write a Spotify song link or "Artist - Song" in your donation message.',
  'help.keepOpen': 'Keep this page or the OBS panel open while you stream. Donations made while it is closed are not added later.',
  'help.rights': 'Music rights: Spotify\'s terms and Twitch\'s music rules may not allow playing Spotify music on stream. Please check them yourself.',

  'footer.private': 'Your logins are stored only in this browser.',
  'logout.confirm': 'Click again to log out',
};

const ru = {
  title: 'Заказ песен',
  subtitle: 'Донаты DonationAlerts → ваша очередь Spotify',

  'notice.notConfigured': 'Страница ещё не настроена. Владелец страницы должен заполнить config.js (см. README).',
  'notice.otherTab': 'Эта страница уже открыта в другой вкладке или окне этого браузера. Пользуйтесь той или закройте её и обновите эту страницу.',
  'notice.daConnected': 'DonationAlerts подключён.',
  'notice.spConnected': 'Spotify подключён.',
  'notice.cancelled': 'Вход в {service} отменён.',
  'notice.oldLink': 'Ссылка для входа устарела. Попробуйте ещё раз.',
  'notice.obsImported': 'Входы и правила загружены. Теперь заказы песен принимает эта панель OBS.',
  'notice.loggedOut': 'Вы вышли на этом устройстве.',
  'notice.obsBad': 'Ссылка для OBS повреждена. Сделайте новую кнопкой «Перенести в OBS».',
  'notice.loginError': 'Вход в {service} не удался: {error}.',
  'notice.close': 'Закрыть',
  'fatal.config': 'В config.js ошибка, поэтому страница не запускается ({message}). Владелец страницы должен её исправить (см. README).',
  'lang.label': 'Язык',

  'ready.yes': 'Готово — ждём донаты',
  'ready.no': 'Пока не готово',

  'row.da': 'DonationAlerts',
  'row.sp': 'Spotify',
  'row.player': 'Плеер Spotify',

  'da.notConnected': 'Не подключено',
  'da.connecting': 'Подключение…',
  'da.connected': 'Подключено: {name}',
  'da.waiting': 'Проблема со связью. Повтор через {seconds} с…',
  'da.expired': 'Вход истёк. Подключите снова.',
  'da.otherTab': 'Работает в другой вкладке',

  'sp.notConnected': 'Не подключено',
  'sp.checking': 'Проверка…',
  'sp.connected': 'Подключено: {name}',
  'sp.premium': 'Нужен Spotify Premium.',
  'sp.sharedHint': 'Нужен Spotify Premium. Перед подключением владелец страницы должен добавить email вашего аккаунта Spotify в своё приложение Spotify.',
  'sp.checkFailed': 'Не удалось проверить подключение',
  'sp.clientLabel': 'Ваш Spotify Client ID',
  'sp.clientInvalid': 'Spotify Client ID — это 32 буквы и цифры.',
  'sp.clientHow': 'Как получить Client ID (около 3 минут)',
  'sp.clientStep1': 'Откройте developer.spotify.com/dashboard и войдите в аккаунт Spotify Premium.',
  'sp.clientStep2': 'Нажмите «Create app». Name: Song requests. Description: Song requests from donations.',
  'sp.clientStep3': 'Redirect URIs: вставьте адрес ниже и нажмите «Add»:',
  'sp.clientStep4': 'Отметьте «Web API», примите условия, нажмите «Save».',
  'sp.clientStep5': 'Откройте «Settings», скопируйте Client ID и вставьте его выше. (Client secret не нужен.)',

  'player.needSpotify': 'Сначала подключите Spotify',
  'player.checking': 'Ищем плеер…',
  'player.none': 'Плеер не найден. Откройте Spotify на этом компьютере или телефоне и один раз нажмите play.',
  'player.ok': 'Найден: {name}',
  'player.active': '{name} (активен)',
  'player.error': 'Не удалось проверить: {message}',

  'btn.connectDa': 'Подключить DonationAlerts',
  'btn.connectSp': 'Подключить Spotify',
  'btn.reconnect': 'Подключить снова',
  'btn.check': 'Проверить снова',
  'btn.dry': 'Проверить',
  'btn.queue': 'Добавить в очередь',
  'btn.copy': 'Копировать',
  'btn.copied': 'Скопировано',
  'btn.moveToObs': 'Перенести в OBS',
  'btn.logout': 'Выйти на этом устройстве',

  'test.title': 'Проверить песню',
  'test.hint': 'Проверяет заказ песни без доната. «Проверить» только показывает, что было бы добавлено.',
  'test.placeholder': 'Название песни или ссылка Spotify',
  'test.donor': 'Тест',

  'activity.title': 'События',
  'activity.empty': 'Здесь появятся донаты и проверки.',
  'activity.test': 'тест',
  'activity.anonymous': 'Аноним',
  'status.queued': 'Добавлено',
  'status.dry-run': 'Было бы добавлено',
  'status.skipped': 'Пропущено',
  'status.error': 'Ошибка',

  'sys.connected': 'Подключено к DonationAlerts.',
  'sys.lost': 'Связь с DonationAlerts потеряна.',
  'sys.waiting': 'Переподключение через {seconds} с (попытка {attempt}).',
  'sys.expired': 'Вход в DonationAlerts истёк. Нажмите «Подключить снова».',
  'sys.bad_message': 'От DonationAlerts пришло сообщение, не похожее на донат: {sample}',
  'sys.spotify_busy': 'Spotify перегружен. Ждём {seconds} с…',
  'sys.switch_device': 'Нет активного плеера Spotify. Переключаемся на «{name}»…',

  'reason.below_min': 'сумма {amount} меньше минимальной ({min})',
  'reason.no_request': 'в сообщении нет ссылки на песню или названия',
  'reason.unsupported_link': 'ссылка ведёт не на отдельную песню (альбомы, плейлисты, исполнители и подкасты не добавляются)',
  'reason.not_found': 'в Spotify ничего не найдено по запросу «{query}»',
  'reason.no_track_for_link': 'в Spotify нет песни по этой ссылке',
  'reason.explicit': 'помечена как explicit (запрещено в правилах)',
  'reason.too_long': 'слишком длинная ({duration}, лимит {max} мин)',
  'reason.blocked_word': 'содержит запрещённое слово «{word}»',
  'reason.blocked_artist': 'исполнитель «{artist}» запрещён',
  'reason.not_playable': 'недоступна в стране вашего Spotify',
  'reason.none_passed': 'ни один из {count} результатов не прошёл правила (первый: {first}, {why})',
  'reason.duplicate': 'уже добавлялась {minutes} мин назад (без повторов {window} мин)',

  'error.network': 'Не удалось связаться с {service}. Проверьте интернет.',
  'error.network.relay': 'Не удалось связаться с relay. Проверьте интернет или попросите владельца страницы проверить relayUrl в config.js.',
  'error.not_connected': '{service} не подключён.',
  'error.expired': 'Вход в {service} истёк. Подключите снова.',
  'error.no_device': 'Плеер Spotify не открыт. Откройте Spotify на этом компьютере или телефоне и один раз нажмите play.',
  'error.premium': 'Spotify не добавил песню. Нужен Spotify Premium, и этому аккаунту Spotify должно быть разрешено пользоваться приложением Spotify.',
  'error.spotify_forbidden': 'Spotify отказал в доступе. Возможно, этому аккаунту Spotify не разрешено пользоваться приложением Spotify (владелец страницы может добавить его в User Management).',
  'error.rate_limit': 'Spotify перегружен. Попробуйте примерно через {minutes} мин.',
  'error.spotify_server': 'У Spotify проблема на сервере. Попробуйте через минуту.',
  'error.spotify_bad_client': 'Spotify не принимает этот Client ID. Проверьте его и то, что в приложении Spotify эта страница указана как redirect URI.',
  'error.login_failed': 'Вход не удался. Попробуйте ещё раз.',
  'error.da_timeout': 'DonationAlerts не ответил вовремя.',
  'error.connection_lost': 'Связь с DonationAlerts потеряна.',

  'rules.title': 'Правила',
  'rules.minAmount': 'Минимальный донат для заказа песни',
  'rules.minAmountHint': 'В валюте вашего DonationAlerts.',
  'rules.blockExplicit': 'Запретить песни с пометкой explicit',
  'rules.maxTrackMinutes': 'Самая длинная песня (минуты)',
  'rules.blockedWords': 'Запрещённые слова',
  'rules.blockedWordsHint': 'По одному в строке. Проверяются в названии песни, именах исполнителей и сообщении доната, в том числе внутри длинных слов.',
  'rules.blockedArtists': 'Запрещённые исполнители',
  'rules.blockedArtistsHint': 'По одному в строке, так, как имя показывает Spotify.',
  'rules.duplicate': 'Не повторять песню в течение (минут)',
  'rules.duplicateHint': '0 отключает проверку.',
  'rules.saved': 'Сохранено. Новые правила действуют сразу.',

  'obs.title': 'Запуск внутри OBS (рекомендуется)',
  'obs.intro': 'В OBS заказы песен работают всё время, пока открыт OBS, а эту вкладку браузера можно закрыть.',
  'obs.before': 'Кнопка остановит заказы песен в этом браузере (чтобы песни не добавлялись дважды) и выдаст ссылку для OBS.',
  'obs.after': 'Заказы песен в этом браузере остановлены. Добавьте ссылку ниже в OBS:',
  'obs.step1': 'В OBS откройте меню «Доки» → «Пользовательские доки браузера…» (в старых OBS: «Вид» → «Доки» → «Пользовательские доки браузера…»).',
  'obs.step2': 'Название дока: Заказ песен. URL: вставьте ссылку. Нажмите «Применить».',
  'obs.step3': 'Не закрывайте панель во время стрима. Её можно сделать маленькой или поместить во вкладку с другими панелями.',
  'obs.warning': 'В этой ссылке ваши входы. Никому её не отправляйте и не показывайте на стриме.',
  'obs.needBoth': 'Сначала подключите DonationAlerts и Spotify.',
  'obs.lost': 'Потеряли ссылку? Подключитесь здесь снова и ещё раз нажмите «Перенести в OBS».',

  'help.title': 'Как зрителям заказывать песни',
  'help.text': 'Зритель пишет в сообщении доната ссылку на песню в Spotify или «Исполнитель - Песня».',
  'help.pageTextLabel': 'Текст для вашей страницы DonationAlerts:',
  'help.pageText': 'Чтобы заказать песню, напишите в сообщении доната ссылку на трек в Spotify или «Исполнитель - Песня».',
  'help.keepOpen': 'Не закрывайте эту страницу или панель OBS во время стрима. Донаты, пришедшие, пока она закрыта, потом не добавляются.',
  'help.rights': 'Права на музыку: условия Spotify и музыкальные правила Twitch могут запрещать воспроизводить музыку из Spotify на стриме. Проверьте их сами.',

  'footer.private': 'Ваши входы хранятся только в этом браузере.',
  'logout.confirm': 'Нажмите ещё раз, чтобы выйти',
};

const dictionaries = { en, ru };
let current = 'en';

export function setLanguage(lang) {
  current = dictionaries[lang] ? lang : 'en';
  return current;
}

export function getLanguage() {
  return current;
}

export function detectLanguage(saved, navigatorLanguage) {
  if (dictionaries[saved]) return saved;
  return /^(ru|uk|be|kk)\b/i.test(navigatorLanguage ?? '') ? 'ru' : 'en';
}

export function t(key, params = {}) {
  const text = dictionaries[current][key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match));
}

export function hasKey(key) {
  return key in en;
}
