// /////////////////////////
// Author: Alexander Lobkov aka Sugrob
// Email: lobkovs@yandex.ru
// /////////////////////////

var casper = require('casper').create({
	verbose: true,
	// logLevel: "debug",
	viewportSize: {
		width: 1280,
		height: 1024
	},
	// retryTimeout: 5 * 60 * 1000, // 5 minute delay between attempts, for wait* family functions
	retryTimeout: 1000,
	waitTimeout: 60 * 1000,
	pageSettings: {
		userAgent: "Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2 924.87 Safari/537.36",
	},
});
var x = require('casper').selectXPath;
var urlParse = require('urlparse');
var config = casper.cli.get('prod') ? require('config_prod') : require('config_local');
var fs = require('fs');

var numberOfStep = 1,
	revisionId = config.revisionId,
	debugScreenNumber = 0,
	startExportTime,
	startImportTime,
	createLogFile = false,
	logFileName,
	logFilePath,
	startDateApp,
	startDateApp2,
	picsPath,
	execFilePath,
	isExportFinish = false,
	isImportFinish = false;

// ////////////////
// START: EVENT HANDLERS
// ////////////////

	casper.setMaxListeners(100);

	casper.on('remote.message', function (msg) {
		myLog('FROM REMOTE PAGE CONSOLE:', msg);
	});

	casper.on('remote.alert', function (msg) {
		myLog('На странице всплыл alert:', msg);
	});

	casper.on('remote.*', function (msg) {
		myLog('remote.*:', msg);
	});

	casper.on('remote.callback', function (msg) {
		myLog('remote.callback:', msg);
	});

	casper.on('remote.confirm', function (msg) {
		myLog('remote.confirm:', msg);
	});

	casper.on('complete.error', function(err) {
		// Experimental below
		doShot(0, "ErrorScreen" + debugScreenNumber);
		debugScreenNumber++;

		this.emit('error', "Complete callback has failed:" + err);
	});

	casper.on('http.status.404', function(resource) {
		this.emit('error', 'Ошибка 404 на странице:', resource.url);
	});

	casper.on('http.status.500', function(resource) {
		this.emit('error', 'Ошибка 500 на странице:', resource.url);
	});

	casper.on('resource.requested', function(requestData) {
		if (isAjaxRequest(requestData.headers)) {
			myLog('resource.requested:', JSON.stringify(requestData));
			myLog('resourse.requested.postData:', JSON.stringify(requestData.postData));
		}
	});

	casper.on('navigation.requested', function(url, navigationType) {
		myLog('CasperJS совершил переход на адрес: "', url, '". Тип перехода:', navigationType);
	});

	casper.on("page.error", function(msg, trace) {
		this.emit('error', 'На странице ' + casper.getCurrentUrl() + ' в JavaScript произошла ошибка: "' + msg + '"', trace);
	});

	// Обработчик при старте каспера
	casper.on('run.start', function() {
		// Если запрещено в конфиге писать HTML логи
		if (!config.htmlLog)
			return true;

		// Если лог уже создан
		if (createLogFile)
			return true;

		// Инициализируем лог
		myLog("Инициализируем лог");
		startDateApp = getStringOfCurrentTimespamp();
		startDateApp2 = new Date();
		// Имя лог файла
		logFileName = 'log_' + startDateApp + '.html';
		// Полный путь лог файла от корня
		logFilePath = fs.pathJoin(fs.workingDirectory, 'logs', logFileName);
		// Временней файла сигнализирующий о выполнении операций в данный момент
		execFilePath = fs.pathJoin(fs.workingDirectory, 'logs', 'exec_' + logFileName);
		myLog(logFilePath);
		// Создаём лог файл
		fs.write(logFilePath, getHeaderHTMLForLog(), 'w');
		// Создаём временный исполняющий файл
		fs.write(execFilePath, 'exec', 'w');
		// Установим что лог файл создан, позволяет создать лог файл один раз за сессию
		createLogFile = true;
	});

	// Обработчик при ошибке
	casper.on('error', function(msg, stacktrace) {
		// Пишем сообщения об ошибке
		myLog("error", "В Casper'e произошла ошибка!");
		myLog("error", "Сообщение:", msg);

		// Переберём и отобразим stacktrace
		if (stacktrace) {
			var output = "";
			casper.each(stacktrace, function(self, elem) {
				if (elem.file)
					output += elem.file;

				if (elem.line)
					output += ":" + elem.line;

				if (elem.function)
					output += " in " + elem.function

				output += "\r\n";
			});
			myLog("error", "Stacktrace: <pre>\r\n", output, "</pre>");
		}

		// Если запрещено в конфиге писать HTML логи
		if (!config.htmlLog)
			return true;

		// Если лог уже создан
		if (!createLogFile)
			return true;

		// Закрываем лог
		myLog('Закрываем лог c ошибкой!', getStringOfCurrentTimespamp());
		myLog('Время выполнения:', elapsedTimeFormat(startDateApp2));

		if (fs.exists(execFilePath)) {
			// Удаляем временный файл
			fs.remove(execFilePath);
			// Временный файл сигнализирующий об ошибке
			errorFilePath = fs.pathJoin(fs.workingDirectory, 'logs', 'error_' + logFileName);
			// Создаём файл сигнализирующий об ошибке
			fs.write(errorFilePath, 'error', 'w');

			myLog("Файл сигнализирующий ошибку, создан!", errorFilePath);
		} else {
			myLog("error", "Временного исполняемого файла", execFilePath, "не существует!");
		}

		// Пишем в файл
		fs.write(logFilePath, getFooterHTMLForLog(), 'a+');

		// Отправляем письмо с ошибкой
		sendMail(true);

		// Закрываем флаг создания файла
		createLogFile = false;
	});

	// Обработчик при финише каспера
	casper.on('run.complete', function(e) {

		// Если запрещено в конфиге писать HTML логи
		if (!config.htmlLog)
			return true;

		// Если лог уже создан
		if (!createLogFile)
			return true;

		// Закрываем лог
		myLog('Закрываем лог.', getStringOfCurrentTimespamp());
		myLog('Время выполнения:', elapsedTimeFormat(startDateApp2));

		// Отправляем обычное письмо
		sendMail();

		// Пишем в файл
		fs.write(logFilePath, getFooterHTMLForLog(), 'a+');
		// Удаляем временный файл
		fs.remove(execFilePath);

		// Закрываем флаг создания файла
		createLogFile = false;
	});

// /////////////////////
// END: EVENT HANDLERS
// /////////////////////

	casper.start(config.mainUrl);

	// Проверка доступности этапов
	casper.then(function() {

		if (casper.cli.get('prod'))
			myLog('Casper запущен в режиме "production"');
		else
			myLog('Casper запущен в режиме "dev"');

		if (!config.steps.length) {
			this.emit("error", "В конфигурационном файле не заданы этапы для выполнения!");
			this.die();
		}
	})

// ////////////////////////////
// START: STEP 1 [Авторизация]
// ////////////////////////////

	casper.then(function() {

		// Проверяем разрешение на выполнение этапа
		if (!isAllowStep("1"))
			return;

		casper.then(function() {
			myLog("Этап 1. [Авторизация]");
			// Отладочное фото
			myLog("До ввода данных для формы входа!");
			doShot(1, "BeforeLogin");

			//Заполняем и отправляем форму логина
			this.fill('form#login-form', {
				'LoginForm[username]' : config.credentials.login,
				'LoginForm[password]' : config.credentials.password
			}, true);

			// Скрин после заполнения формы логина
			myLog('Введены данные для формы входа!');
			doShot(2, "LoginInput");
		});

		// Ожидание загрузки index'ой странциы
		casper.waitForUrl('/', function() {
			// if (this.getCurrentUrl() != config.mainUrl + '/') {
			// 	this.emit('complete.error', 'Некорректная авторизация!');
			// }
			myLog('После ввода данных на форме регистрации: ' + this.getCurrentUrl());
			doShot(3, "AfterLogin");
		}, function() {
			this.emit('complete.error', 'Авторизация длится слишком долго!');
			this.die();
		});
	});

// //////////////
// END: STEP 1
// //////////////

// /////////////////////////////////////////
// START: STEP 2 [Создание пустой ревизии]
// /////////////////////////////////////////

	casper.then(function() {

		// Проверяем разрешение на выполнение этапа
		if (!isAllowStep("2"))
			return;

		casper.then(function() {
			numberOfStep = 2;
			myLog("Следующий этап.", "Текущий номер этапа", numberOfStep, '[Создание пустой ревизии]');
		});

		// Администрирование
		casper.thenClick(x('//a[text()="Администрирование"]'), function() {
			myLog('Была нажата ссылка "Администрирование"');
			doShot(1, 'ClickAdministerLink');
		});

		// Ревизии справочников
		casper.thenClick(x('//a[text()="Ревизии справочников"]'), function() {
			myLog('Была нажата ссылка "Ревизия справочников"');
			doShot(2, 'ClickRevisionDict');
		});

		// Галка на тарифы
		casper.thenClick("#common-list input[value='2']", function() {
			myLog('Отмечен чекбокс тарифов');
			doShot(3, 'MarkTariffs');
		});

		// Создать ревизию
		casper.thenClick("#copy-revision-show-popup", function() {
			myLog('Была нажата кнопка "Создать ревизию".');
			// Wait потому что окно открывается по AJAX запросу,
			// поэтому надо принудительно подождать
			this.wait(2000, function() {
				myLog('Открыто модальное окно создание новой(пустой) ревизии');
				doShot(4, 'CreateRevisionModal');
			})
		});

		// Модальное окно новой пустой ревизии
		casper.thenClick("#common-list-popup input[value='-1']", function() {
			myLog('Отмечен чекбокс пустой ревизии.');
			doShot(5, 'ClickOnNullRevision');
		});

		// Нажатие клавиши создать ревизию в модальном окне
		casper.thenClick('#new-revision', function() {
			this.wait(2000, function() {
				myLog('Была нажата кнопка "Создать ревизию"');
				doShot(6, 'ClickNewRevisionOnModal');
			})
		});

		// Запомним новый ID ревизии
		casper.then(function() {
			revisionId = this.evaluate(function() {
				var id = $("td:contains('Тарифы')").parent("tr").find(".revision-td a").text();
				return id.replace(".","");
			});

			if (revisionId == "") {
				this.emit('error', "Не удалось запомнить номер ревизии. Возможно селектор недоступен!");
				this.die();
			}

			myLog("Ревизия создана! ID новой ревизии:", revisionId);
		});
	});

// //////////////
// END: STEP 2
// //////////////

// ///////////////////////////////////
// START: STEP 3 [8 часовой импорт]
// ///////////////////////////////////

	casper.then(function() {

		// Проверяем разрешение на выполнение этапа
		if (!isAllowStep("3"))
			return;

		casper.then(function() {
			numberOfStep = 3;
			myLog("Следующий этап.", "Текущий номер этапа", numberOfStep, '[8 часовой импорт]');
		});

		// Справочники
		casper.thenClick(x('//a[text()="Справочники"]'), function() {
			myLog('Была нажата ссылка "Справочники"');
			doShot(1, 'ClickDictMenuLink');
		});

		// Загрузка тарифов из DPC
		casper.thenClick(x('//a[text()="Загрузка тарифов из DPC"]'), function() {
			myLog('Была нажата ссылка "Загрузка тарифов из DPC"');
			doShot(2, 'ClickLoadTariffFromDPC');
		});

		// casper.thenEvaluate(function() {
		// 	window.confirm = function(ss) {return true;}
		// 	window.alert = function(ee) {return true;}
		// });

		// Начать загрузку
		// casper.thenClick('#start-loading', function() {
		// 	var timeLoad = new Date();
		// 	myLog('Начинаю процесс "Загрузка тарифов из DPC" в', getStringOfCurrentTimespamp());
		// 	doShot(3, 'ClickStartLoading');
		// 	this.waitFor(
		// 		function() { // TestFX
		// 			return this.evaluate(function() {
		// 				// Ouput if tag #response not empty
		// 				if ($('#response').text().trim()) {
		// 					console.log(
		// 						'Тэг #response содержит:',
		// 						$('#response').text().trim()
		// 					)
		// 				}
		// 				// Debug if need
		// 				console.log("Overlay length: " + $("#overlay").length);
		// 				// console.log("Overlay isset: " + $("#overlay").length == 0);
		// 				return $("#overlay").length == 0;
		// 			});
		// 		},
		// 		function () { // Function Then
		// 			// Посчитаем затраченное время
		// 			var seconds = diffTime(new Date(), timeLoad);
		// 			// Debug photo
		// 			myLog('Процесс "Загрузка тарифов из DPC", завершён! За время(сек):', elapsedTimeFormatFromSeconds(seconds));
		// 			doShot(4, 'WaitOverlayEnd');
		// 		},
		// 		function() { // TimeOut function
		// 			myLog("Ожидание загрузки тарифов из DPC продлилось больше 10 часов!", 'error');
		// 			this.emit('error', "Ожидание загрузки тарифов из DPC продлилось больше 10 часов!");
		// 			this.die();
		// 		},
		// 		10 * 60 * 60 * 1000) // 10 часов ожидания
		// });

		// Начать загрузку
		casper.thenClick('#start-loading', function() {
			startImportTime = new Date();
			myLog('Начинаю процесс "Загрузка тарифов из DPC" в', getStringOfCurrentTimespamp());
			doShot(3, 'ClickStartLoading');
			checkImportFinish();
		})

		function checkImportFinish() {
			// Посчитаем текущее затраченное время
			var importTimeDifference = diffTime(new Date(), startImportTime);

			// Проверим наличие #overlay на странице
			if (casper.exists("#overlay")) {
					// Временно отключим вывод
					// myLog('Экспорт в процессе! Прошло:', elapsedTimeFormatFromSeconds(importTimeDifference));

					// Через какой период времени обрубать
					if (importTimeDifference >= 10 * 60 * 60) { // 10 часов
						casper.emit('error', 'Время ожидания окончание "Импорта", более 10 часов! Возможно какая то ошибка на стороне CMS. Дальнейшая обработка остановлена. Этап 3.');
						casper.die();
					}

					// Перезапуск проверки через 5 минут
					casper.wait(5 * 60 * 1000, function() {
						checkImportFinish();
					});
			} else {
				// Overlay отсутствует на странице, значит импорт окончен
				myLog('Импорт окончен! Прошло:', elapsedTimeFormatFromSeconds(importTimeDifference));
				doShot(4, 'ImportIsFinish');
				isImportFinish = true;
			}
		}
	});

// //////////////
// END: STEP 3
// //////////////

// /////////////////////////
// START: STEP 4 [Обучение]
// /////////////////////////

	casper.then(function() {

		// Проверяем разрешение на выполнение этапа
		if (!isAllowStep("4"))
			return;

		if (!isImportFinish && isAllowStep("3")) {
			this.emit("error", "НЕ могу начать этап 4 [Обучение]!!! Импорт НЕ завершён!");
			this.die();
		}

		casper.then(function() {
			numberOfStep = 4;
			myLog("Следующий этап.", "Текущий номер этапа", numberOfStep, '[Обучение]');
		});

		// Инфо
		casper.then(function() {
			myLog("Начинаю перебор тарифов. Тарифы определены в config_*.json");
		})

		// Дальше в цикле из конфига по тарифам
		casper.each(config.tarrifs, function(self, tariff) {
			casper.then(function() {
				myLog("Тариф:", tariff.name, "Словарь обучения:", tariff.educationDict);
			})

			// Справочники
			casper.thenClick(x('//a[text()="Справочники"]'), function() {
				myLog('[' + tariff.name + ']', 'Нажата ссылка "Справочники"');
				this.wait(5000, function() {
					doShot(1, tariff.name + '_ClickDictMenuLink');
				});
			});

			// Тарифы
			casper.thenClick(x('//a[text()="Тарифы"]'), function() {
				myLog('[' + tariff.name + ']', 'Нажата ссылка "Тарифы"');
				this.wait(5000, function() {
					doShot(2, tariff.name + '_ClickTariffMenuLink');
				});
			});

			// Фильтр "регион Москва и Подмосковье"
			casper.then(function() {
				myLog('[' + tariff.name + ']', 'Выбрана опция фильтра "Москва и Подмосковье"');
				this.fillSelectors('#filters-show', {
					'select[name="tbl.region_id"]' : 'Москва и Подмосковье',
				}, false);
				this.wait(2000, function() {
					doShot(3, tariff.name + '_SelectOptionMoscowAndRegion');
				});
			});

			// Фильтровать
			casper.thenClick('#filters-button', function() {
				myLog('[' + tariff.name + ']', 'Нажата кнопка "Фильтровать"');
				this.wait(2000, function() {
					doShot(4, tariff.name + '_ClickOnFilterButton');
				});
			});

			// Нажимает на кнопку редактирования
			casper.thenClick(x('//td[text()="' + tariff.name + '"]/..//a[text()="Ред."]'), function() {
				myLog('[' + tariff.name + ']', 'Нажата кнопка "Редактировать" на тарифе [', tariff.name, ']');
				this.wait(5000, function() {
					doShot(5, tariff.name + '_ClickOnEditTariff');
				});
			});

			// Заполняет select значением и конфига @config.json
			casper.then(function() {
				myLog('[' + tariff.name + ']', 'Выбрано "Обучение"', tariff.educationDict);
				// this.fillSelectors('form#testttt', getSelectorObjectOnStep04(), false);
				this.fillSelectors(x('//form[@name="frm"]'), getSelectorObjectOnStep04(tariff), false);
				this.wait(5000, function() {
					doShot(6, tariff.name + '_EducationSelect');
				})
			});

			// Нажимаем сохранить
			casper.thenClick(x('//form[@name="frm"]/button[@type="submit"]'), function() {
				myLog('[' + tariff.name + ']', 'Нажали кнопку "Сохранить"');
				this.wait(5000, function() {
					doShot(7, tariff.name + '_ClickAfterFillEducationSelect');
				});
			})
		});

	});

// //////////////
// END: STEP 4
// //////////////

// ////////////////////////////
// START: STEP 5 [Фиксация ревизии]
// ////////////////////////////

	casper.then(function() {

		// Проверяем разрешение на выполнение этапа
		if (!isAllowStep("5"))
			return;

		casper.then(function() {
			numberOfStep = 5;
			myLog("Следующий этап.", "Текущий номер этапа", numberOfStep, '[Фиксация ревизии]');
		});

		// Администрирование
		casper.thenClick(x('//a[text()="Администрирование"]'), function() {
			myLog('Нажата ссылка "Администрирование"');
			this.wait(5000, function() {
				doShot(1, 'ClickAdminMenuLink');
			});
		});

		// Ревизии справочников
		casper.thenClick(x('//a[text()="Ревизии справочников"]'), function() {
			myLog('Нажата ссылка "Ревизии справочников"');
			this.wait(5000, function() {
				doShot(2, 'ClickDictRevisionLeftBlockMenuLink');
			});
		});

		// Клик по ID ревизии
		casper.then(function() {
			// Для появления в локальной области видимости,
			// иначе @revisionId ровняется 0
			var rev = revisionId;
			// Проверка на значение ревизии
			if (rev == 0) {
				this.emit('error', "Значение ревизии = 0. Этап 5.");
				this.die();
			}
			// Клик
			myLog("Нажата ссылка ревизии", rev);
			this.thenClick(x('//a[text()=".' + rev + '"]'), function() {
				this.wait(5000, function() {
					doShot(3, "ClickIDRevision");
				});
			})
		});

		// Заполняет select значением и конфига @config_*.js
		casper.then(function() {
			// Введём значение в поле комментария к ревизии
			this.evaluate(function(comment) {
				$("#revision-comment").val(comment);
			}, getStringOfCurrentTimespamp());

			myLog("Введён комментарий к ревизии");
			doShot(4, "InputRevisionComment");
		});

		// Жмем "сохранить комментарий"
		casper.thenClick('#save-comment', function() {
			myLog('Нажали кнопку "Сохранить комментарий"');
			// Принудительно ждём 4,5 секунды,
			// потому что выполняется AJAX запрос
			this.wait(4500, function() {
				doShot(5, "ClickSaveCommentButton");
			});
		});

		// Добавим автоматический положительный ответ на всплывающте alert'ы
		// casper.thenEvaluate(function() {
		// 	window.alert = function(ee) {return true;}
		// });

		// Жмем "зафиксировать"
		casper.thenClick('#fix-revision', function() {
			myLog('Нажали кнопку "Зафиксировать"');
			// Принудительно ждём 4,5 секунды,
			// потому что выполняется AJAX запрос
			this.wait(4500, function() {
				doShot(6, "ClickFixRevisionButton");
			});
		});
	});

// //////////////
// END: STEP 5
// //////////////

// ///////////////////////////////////////////////////////////////
// START: STEP 6
// 		[Выбор для какой версии применить новую ревизию
// 		и ожидание завершения экспорта]
// ///////////////////////////////////////////////////////////////

	casper.then(function() {

		// Проверяем разрешение на выполнение этапа
		if (!isAllowStep("6"))
			return;

		casper.then(function() {
			numberOfStep = 6;
			myLog("Следующий этап.", "Текущий номер этапа", numberOfStep, '[Выбор для какой версии применить новую ревизию\
	 		и ожидание завершения экспорта]');
		});

		// Администрирование
		casper.thenClick(x('//a[text()="Администрирование"]'), function() {
			myLog('Нажали ссылку "Администрирование"');
			this.wait(5000, function() {
				doShot(1, 'ClickAdminMenuLink');
			});
		});

		// Экспорт справочников
		casper.thenClick(x('//a[text()="Экспорт справочников"]'), function() {
			myLog('Нажали ссылку "Экспорт справочников"');
			this.wait(5000, function() {
				doShot(2, 'ClickDictRevisionLeftBlockMenuLink');
			});
		});

		// Нажимам на ссылку сменить ревизию
		casper.thenClick(x('//*[text()="Тарифы"]/../..//a[text()="Сменить ревизию"]'), function() {
			myLog('Нажали ссылку "Сменить ревизию"');
			this.wait(5000, function() {
				doShot(3, 'ClickOnLinkChangeRevision');
			});
		});

		// Отметим галку на справочнике "Тарифы"
		casper.then(function() {
			var rev = revisionId;
			// var rev = 783; // for test
			myLog('Отметили чекбокс "Ревизии"', rev);
			this.thenClick(x('//*[@id="common-list-popup"]//input[@value="' + rev + '"]'), function() {
				doShot(4, 'ClickOnCheckBoxRevision');
			});
		})

		// Нажмём кнопку "Выбрать" в модальном окне
		casper.thenClick(x('//button[@id="select-revision"]'), function() {
			myLog('Нажали кнопку "Выбрать" в модальном окне');
			this.wait(5000, function() {
				doShot(5, 'ClickOnButtonВыбрать');
			});
		})

		casper.then(function() {
			var rev = revisionId;
			// var rev = 783; // for test
			var xPath = x('//*[text()="Тарифы"]/../..//*[normalize-space(text())="На выгрузку ревизия ' + rev + '"]');
			// Проверим элемент "На выгрузку ревизия: ххх", что сигнализирует о начале операции экспорта
			if (!this.exists(xPath)) {
				this.emit('complete.error', 'Элемент "На выгрузку ревизия ' + rev + '" НЕ существует. Дальнейшая обработка остановлена. Этап 6.');
				this.die();
			}
			// Отметим галку на тарифах чтобы разблокировать экспорт
			myLog('Отметили галку на тарифе');
			this.thenClick(x('//*[text()="Тарифы"]/../..//input[@type="checkbox"]'), function() {
				doShot(6, 'ClickOnCheckBoxTariff');
			});

			// Внедрим версии тарифов на страницу в обьект @"toVersion", так же не забудем про HTML версию,
			// иначе обработчик кнопки @"Экспортировать" не пропустит запрос.
			//
			// Внедрим ревизии через JavaScript, потому что писать на Casper'e будет дольше и затратней.
			this.thenEvaluate(function(confVesions, versionsHTML) {
				// Временный обьект массива для полученный ID ревизий
				var tempRevisions = [];
				// Найдём ID для каждой ревизии из @availableVersions
				confVesions.forEach(function(revision) {
					$.each(availableVersions, function(index, version) {
						if (revision == version) {
							tempRevisions.push(index);
						}
					});
				});
				console.log('tempRevisions', tempRevisions);
				// Присвоим
				toVersions = tempRevisions;
				console.log("toVersions", toVersions);

				// Подставим HTML версию
				$("#to-versions-selected").html(versionsHTML);

			}, config.versions, getVersionsHTML());

			this.then(function() {
				myLog('После программного выбора версий приложения!');
				doShot(7, 'AfterJSEvaluate');
			})

		});

		// Обработка ошибки
		casper.then(function() {
			this.wait(2000, function() {
				if (this.exists("#select-version.filled-inactive")) {
					this.emit('error', 'Кнопка "Экспорта" неактивна! Дальнейшая обработка остановлена. Этап 6.');
					this.die();
				}
			})
		})

		// Ожидание подтверждения алертом
		casper.thenClick("#select-version", function() {
			myLog('Нажата кнопка "Экспортировать"');
			// Запомним "глобально" время начала "Экспорта"
			startExportTime = new Date();
		});

		// Ожидаем alert
		casper.waitForAlert(function(response) {
			myLog('Экспорт начался в', getStringOfCurrentTimespamp());
			myLog('Response.Data', response.data);
		}, function() {
			this.emit('error', 'Время ожидания начала "Экспорта", истекло! Дальнейшая обработка остановлена. Этап 6.');
			this.die();
			// myLog('Время ожидания начала "Экспорта", истекло!');
		}, 20 * 1000); // 20 секунда ожидание алерта

		// Скриншот после перезагрузки страницы
		casper.then(function() {
			myLog('После перезагрузки страницы');
			this.wait(10000, function() {
				doShot(8, 'AfterExportPageRefresh');
			});
		});

		// Ожидание завершения процесса экспорта
		// Вкраце, обновляем страницу до тех пор,
		// пока не исчерзнет надпись @"Выгружается ревизия xxx"
		casper.then(function() {
			myLog('Начат процесс "Ожидания завершения "Экспорта"!');
			checkFinishExport();
		});

		function checkFinishExport() {
			var rev = revisionId;
			// var rev = 783; // for test
			// var xPath = x('//*[text()="Тарифы"]/../..//td[normalize-space(text())="Выгружается ревизия ' + rev + '"]');
			casper.reload(function() {
				// Временно отключим вывод
				// myLog("Страница перезагружена!");

				var originalExportStatusText = "Выгружается ревизия " + rev;

				// Найдем целевой текст статуса экспорта "Тарифов" для последующего стравнения
				var statusText = this.evaluate(function() {
					var originalText = "Тарифы";
					// Выберем все элементы которые содержат "Тарифы"
					var elems = $("td:contains('" + originalText + "')");
					var targetElem;
					// Если элементов больше одного, то найдём только то что конкретно совпадает со словом "Тарифы"
					if (elems.length > 1) {
						elems.each(function(index, el) {
							if ($(el).text() == originalText) {
								targetElem = $(el);
							}
						});
					} else {
						// Иначе просто возмём что получилось
						targetElem = elems;
					}
					// Найдём индекс заголовка "Статус" в таблице,
					// чтобы затем по индексу найти целевой текст статуса для "Тарифов"
					var numberOfColumStatus = targetElem
												.parents("table")
												.find("thead th:contains('Статус')")
												.index();
					// Найдём целевой текст по номеру колонки
					var targetStatusText = targetElem
												.parent("tr")
												.find("td:eq(" + numberOfColumStatus + ")")
												.text()
												.trim();
					return targetStatusText;
				});

				// Посчитаем текущее затраченное время
				var exportTimeDifference = diffTime(new Date(), startExportTime);

				// Проверим пустоту текста статуса в общем
				if (statusText.length > 0) {
					// Проверим совпадение с оригинальным текстом. Если "да", значит экпорт продолжается
					// Если "нет", значит в CMS поменяли текстовку
					if (statusText == originalExportStatusText) {
						// Временно отключим вывод
						// myLog('Экспорт в процессе! Прошло:', elapsedTimeFormatFromSeconds(exportTimeDifference));

						// Через какой период времени обрубать
						if (exportTimeDifference >= 3 * 60 * 60) { // 3 часа
							casper.emit('error', 'Время ожидания окончание "Экспорта", более 3 часов! Возможно какая то ошибка на стороне CMS. Дальнейшая обработка остановлена. Этап 6.');
							casper.die();
						}

						// Перезапуск проверки через 5 минут
						casper.wait(5 * 60 * 1000, function() {
							checkFinishExport();
						});

					} else {
						this.emit("error", 'Не удалось найти текст статуса экспорта "Тарифов" на этапе ожидания! \
						          Текст статуса существует "' + statusText + '", но отличается от целевого "' + originalExportStatusText + '". \
						          Ожидание экспорта прервано! Этап 6.');
						this.die();
					}
				} else {
					// Текст статуса пуст, значит экспорт окончен
					myLog('Экспорт окончен! Прошло:', elapsedTimeFormatFromSeconds(exportTimeDifference));
					doShot(9, 'ExportIsFinish');
					isExportFinish = true;
				}
			})
		}
	});

// //////////////
// END: STEP 6
// //////////////

// ////////////////////////////////////////////////////////////////////
// START: STEP 7 [Обновление состояния ревизии для версий приложения]
// ////////////////////////////////////////////////////////////////////

	casper.then(function() {

		// Проверяем разрешение на выполнение этапа
		if (!isAllowStep("7"))
			return;

		if (!isExportFinish) {
			this.emit("error", "НЕ могу начать этап 7 [Обновление состояния ревизии для версий приложения]!!! Экспорт НЕ завершён!");
			this.die();
		}

		casper.then(function() {
			numberOfStep = 7;
			myLog("Следующий этап.", "Текущий номер этапа", numberOfStep, '[Обновление состояния ревизии для версий приложения]');
		});

			// Администрирование
		casper.thenClick(x('//a[text()="Администрирование"]'), function() {
			myLog('Нажали ссылку "Администрирование"');
			this.wait(5000, function() {
				doShot(1, 'ClickAdminMenuLink');
			});
		});

		// Экспорт справочников
		casper.thenClick(x('//a[text()="Экспорт справочников"]'), function() {
			myLog('Нажали ссылку "Экспорт справочников"');
			this.wait(5000, function() {
				doShot(2, 'ClickDictRevisionLeftBlockMenuLink');
			});
		});

		// Инфо
		casper.then(function() {
			myLog('Начинаю процесс "натыкивания" перевода состояния версии приложения!');
		});

		// Дальше в цикле из конфига по ревизиям
		casper.each(config.versions, function(self, version) {

			casper.then(function() {
				myLog('Обрабатываю версию:', version);
			})

			// Выберем версию
			casper.then(function() {
				// myLog("Версия:", version);
				myLog('Выбираю в selectbox\'е версию:', version);
				this.fillSelectors(x('//*[text()="Тарифы"]/../..'), {
					'select[class="select-version"]' : version,
				}, false);
				// Сфоткаем
				this.wait(500, function() {
					doShot(3, version + '_SelectVersionOnDictTariff');
				});
			});

			// Применим "STAGE" версию
			casper.then(function() {
				myLog('Переношу версию', version, 'в состояние "stage"');
				this.fillSelectors(x('//*[text()="Тарифы"]/../..//*[@data-version="' + version + '"]/*[@class="devel"]'), {
					'select[class="move-to"]' : 'stage'
				}, false);
			});

			// Инфо
			casper.waitForAlert(function(response) {
				myLog('Версия', version, 'перенесена в "stage"!');
				// doShot(4, version + '_MoveToStageVersion');
			});

			// После перезагрузки на этапе "stage", заново в selectbox'e выберем версию
			// Осссобенность работы CMS. Необходимо после каждой итерации выбирать версию.
			casper.then(function() {
				this.wait(5000, function() {
					myLog('После перезагрузки, выбираю заново в selectbox\'е версию:', version);
					this.fillSelectors(x('//*[text()="Тарифы"]/../..'), {
						'select[class="select-version"]' : version,
					}, false);
					// Сфоткаем
					this.wait(500, function() {
						// myLog('Выбрана версия для "stabe":', version);
						doShot(5, version + '_SelectVersionOnDictTariff');
					});
				})
			})

			// Применим "STABLE" версию
			casper.then(function() {
				myLog('Переношу версию', version, 'в состояние "stable"');
				this.fillSelectors(x('//*[text()="Тарифы"]/../..//*[@data-version="' + version + '"]/*[@class="stage"]'), {
					'select[class="move-to"]' : 'stable'
				}, false);
			});

			// Сфоткаем
			casper.waitForAlert(function(response) {
				myLog('Версия', version, 'перенесена в состояние "stable"!');
				//doShot(5, version + '_MoveToStableVersion');
			});
		});
	});


// //////////////
// END: STEP 7
// //////////////

// ///////////////////////////////////////////////
// START: STEP 8 [Запускаем финальный bat'ник]
// ///////////////////////////////////////////////

	// Example
	// "data": {
		// "command": "./test.sh",
		// "parameters": [],
		// "pid": 6452,
		// "stdout": "Starting\nDone\n",
		// "stderr": "",
		// "exitCode": 0,
		// "elapsedTime": 10029,
		// "isChildNotFinished": 0
	// }

	// casper.then(function() {
	// 	numberOfStep++;
	// 	myLog("Следующий этап.", "Текущий номер этапа", numberOfStep, "[Запускаем финальный bat'ник]");
	// });

	// casper.then(function() {
	// 	// Выполним завершающий shell скрипт
	// 	this.waitForExec('./test.sh', null,
	// 		function(response) {
	// 			var data = response.data;
	// 			myLog("Ответ от shell скрипта " +
	// 				data.command + ":\n\n" +
	// 				data.stdout + "\n\n, за " +
	// 				data.elapsedTime / 1000 + " секунд"
	// 				);
	// 		}, function(timeout, response) {
	// 			var data = response.data;
	// 			myLog("Время выполнения скрипта " +
	// 				data.command + ", больше чем " +
	// 				timeout / 1000 + "секунд"
	// 				);
	// 	}, 10 * 60 * 1000); // 10 минут.
	// });

// //////////////
// END: STEP 8
// //////////////

casper.run();

// ///////////////
// ///////////////
// //// TOOLS
// ///////////////
// ///////////////

// Write pretty log:)
function myLog() {
	casper.echo("");
	casper.echo("######  " + Array.prototype.join.call(arguments, " ") + "  ######");
	casper.echo("");

	// Если разрешены HTML логи в конфиге и лог уже создан
	if (config.htmlLog && createLogFile) {
		var writeStringInToLog = "######  " + Array.prototype.join.call(arguments, " ") + "  ######";
		putHTMLMessageInToLog(writeStringInToLog);
	}
}

// Does screenshot current page state
// If @stepInnerNumber equals 0,
// then inner step number not included in capture filename
function doShot(stepInnerNumber, name) {

	// Создаём и кэшируем путь до картинок для текущего инстанса приложения
	if (!picsPath) {
		// picsPath = fs.pathJoin(fs.workingDirectory, 'pic', startDateApp);
		picsPath = fs.pathJoin('pic', startDateApp);
	}

	// Формируем путь до текущей картинки
	var fileName = 'Step' + numberOfStep + '.';

	if (stepInnerNumber != 0) {
		fileName += checkLeadZero(stepInnerNumber) + '.';
	}
	fileName += name + '.png';

	// Результирующий путь до текущей картинки
	var resultPicsPath = fs.pathJoin(picsPath, fileName);

	// Делаем снимок
	casper.capture(resultPicsPath);

	// Если разрешены HTML логи в конфиге и лог уже создан
	if (config.htmlLog && createLogFile) {
		putHTMLMessageInToLog("<p style='text-align:center;'><img style='width:50%;border:1px solid #eee;' src='" + resultPicsPath + "' alt='" + fileName + "'/></p>");
	}
}

// Create and return object for casper fill function
function getSelectorObjectOnStep04(tariff) {
	// Parse URL
	var urlP = urlParse(casper.getCurrentUrl());
	// Build name string for the block of select
	var tempHTMLSelectName = 'dict___tariff__web_page_id__replace__id__' +
			urlP.queryKey.id + '__region_id__' + urlP.queryKey.region_id;
	// Finalize name string for the block of select
	var selectField = 'select[name="' + tempHTMLSelectName + '"]';
	// Create object of select for casper fill function
	var formHTMLSelectObject = {};
	formHTMLSelectObject[selectField] = tariff.educationDict;

	// Return object of select
	return formHTMLSelectObject;
}

function getStringOfCurrentTimespamp() {
	var today = new Date()
		, Y = today.getFullYear()
		, m = checkLeadZero(today.getMonth() + 1) // +1 потому что месяцы в JS начинаются с "0"
		, d = checkLeadZero(today.getDate())
		, H = checkLeadZero(today.getHours())
		, i = checkLeadZero(today.getMinutes())
		, s = checkLeadZero(today.getSeconds());
	return Y + '.' + m + '.' + d + ' ' + H + ':' + i + ':' + s;
}

// Return HTML version of versions from config, with delimiter @<br>
function getVersionsHTML() {
	return Array.prototype.join.call(config.versions, "<br>");
}

// Return formatter lead zero
function checkLeadZero(value) {
	if (value < 10) {
		return '0' + value;
	} else {
		return value;
	}
}

function putHTMLMessageInToLog(message) {
	// Стили по-умолчанию
	var style = '\
		border: 1px solid #aaa;\
		padding: 5px 10px;\
		box-sizing: border-box;\
		margin-bottom: 15px;\
		';

	// Если если ошибка добавим соответствующий стиль
	if (/err(or)?/.test(message))
		style += 'background-color: red;';

	fs.write(
		logFilePath,
		"<div style='" + style + "'>\
			<p>" + getStringOfCurrentTimespamp() + "</p>\
			<p>" + message + "</p>\
		</div>", 'a');
}

// Calc difference time in seconds
function diffTime(now, last) {
	var differenceTimeExport = now.getTime() - last.getTime();
	return Math.floor((differenceTimeExport) / (1000));
}

// Return HH:MM:SS format for execution app.
function elapsedTimeFormat(last) {
	var sec = diffTime(new Date(), last);
	var hours = Math.floor(sec / 3600);
	var minutes = Math.floor((sec - (hours * 3600)) / 60);
	var seconds = sec - (hours * 3600) - (minutes * 60);

	return checkLeadZero(hours) + ':' + checkLeadZero(minutes) + ':' + checkLeadZero(seconds);
}

// Return HH:MM:SS format from input seconds
function elapsedTimeFormatFromSeconds(sec) {
	// var sec = diffTime(new Date(), last);
	var hours = Math.floor(sec / 3600);
	var minutes = Math.floor((sec - (hours * 3600)) / 60);
	var seconds = sec - (hours * 3600) - (minutes * 60);

	return checkLeadZero(hours) + ':' + checkLeadZero(minutes) + ':' + checkLeadZero(seconds);
}

// Send mail
// error may be true or false, if true send "error" mail, else send "ok" mail
function sendMail(error) {
	// Запускаем дочерний процесс отвечающий за отправку писем о окончании процесса
	var process = require("child_process");
	var spawn = process.spawn;
	var child;

	if (!config.sendMail)
		return;

	myLog("Запуск sendMail");

	// Выполняем shell скрип sendMail
	// В скрипте генерируется шаблон письма и отправляется на email
	if (error) {
		child = spawn("./sendMailError" , [config.toMailSends, logFileName, getStringOfCurrentTimespamp(), elapsedTimeFormat(startDateApp2)]);
	} else {
		child = spawn("./sendMail" , [config.toMailSends, logFileName, getStringOfCurrentTimespamp(), elapsedTimeFormat(startDateApp2)]);
	}

	// Обработчик "обычного" вывода
	child.stdout.on("data", function (data) {
		myLog("spawnSTDOUT:", JSON.stringify(data));
	});

	// Обработчки вывода в случае ошибки
	child.stderr.on("data", function (data) {
		myLog("spawnSTDERR:", JSON.stringify(data));
	});

	//  Обработчик в случае окончания процесса
	child.on("exit", function (code) {
		myLog("spawnEXIT:", code);
	});
}

// Check exist value in array
function isInArray(array, search) {
	return array.indexOf(search) >= 0;
}

// Check allow for input step
function isAllowStep(stepId) {
	return isInArray(config.steps, stepId)
		|| isInArray(config.steps, "*");
}

// Check ajax request
function isAjaxRequest(headers) {
	for (var i = headers.length - 1; i >= 0; i--) {
		var header = headers[i];
		if (header.value === "XMLHttpRequest") {
			return true;
		}
	}
	return false;
}

// /////////////////////
// /////////////////////
// Log HTML template
// /////////////////////
// /////////////////////

function getHeaderHTMLForLog() {
	return '<!DOCTYPE html>\
		<html lang="ru">\
		<head>\
			<meta charset="UTF-8"/>\
			<title>Document</title>\
		</head>\
		<body>\
		<h2>' + startDateApp + '</h2>';
}

function getFooterHTMLForLog() {
	return '</body>\
		</html>';
}

// casper.waitForSelector('#login', function success() {
//     this.test.pass('selector was found');
//     this.click("#login");
// }, function fail() {
//     this.test.fail('selector was found');
// });

// casper.then(function() {
//     this.sendKeys('form.contact input#name', 'Duke');
//     this.sendKeys('form.contact textarea#message', "Damn, I'm looking good.");
//     this.click('form.contact input[type="submit"]');
// });

// throw new Error("test");



