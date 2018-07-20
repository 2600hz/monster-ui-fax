define(function(require) {
	var $ = require('jquery'),
		_ = require('lodash'),
		monster = require('monster'),
		toastr = require('toastr');

	var app = {
		name: 'fax',

		css: [ 'app' ],

		i18n: {
			'de-DE': { customCss: false },
			'en-US': { customCss: false }
		},

		requests: {},
		subscribe: {},

		load: function(callback) {
			var self = this;

			self.initApp(function() {
				callback && callback(self);
			});
		},

		appFlags: {
			ranges: {
				default: 7,
				max: 31
			},
			faxboxes: {}
		},

		initApp: function(callback) {
			var self = this;

			monster.pub('auth.initApp', {
				app: self,
				callback: callback
			});
		},

		render: function(container) {
			var self = this;

			self.getFaxData(function(results) {
				self.appFlags.faxboxes = _.keyBy(results.faxboxes, 'id');
console.log(_.size(self.appFlags.faxboxes));
				var menus = [
					{
						tabs: [
							{
								text: self.i18n.active().fax.menuTitles.inbound,
								callback: self.renderNewInbound
							},
							{
								text: self.i18n.active().fax.menuTitles.outbound,
								callback: self.renderNewOutbound
							},
							{
								text: self.i18n.active().fax.menuTitles.logs,
								callback: self.renderLogs
							}
						]
					}
				];

				if (results.storage) {
					var tabStorage = {
						text: self.i18n.active().fax.menuTitles.storage,
						callback: self.renderStorage
					};

					menus[0].tabs.push(tabStorage);
				}

				monster.ui.generateAppLayout(self, {
					menus: menus
				});
			});
		},

		getFaxData: function(callback) {
			var self = this;

			monster.parallel({
				faxboxes: function(callback) {
					self.listFaxboxes(function(faxboxes) {
						callback(null, faxboxes);
					});
				},
				storage: function(callback) {
					self.getStorage(function(storage) {
						callback(null, storage);
					});
				}
			},
			function(err, results) {
				callback && callback(results);
			});
		},

		renderNewInbound: function(pArgs) {
			var self = this;

			self.renderCommon(pArgs, 'inbound');
		},

		renderNewOutbound: function(pArgs) {
			var self = this;

			self.renderCommon(pArgs, 'outbound');
		},

		renderCommon: function(pArgs, type) {
			var self = this,
				args = pArgs || {},
				parent = args.container || $('#fax_app_container .app-content-wrapper'),
				dataTemplate = {
					faxboxes: self.appFlags.faxboxes,
					count: _.size(self.appFlags.faxboxes)
				},
				template = $(self.getTemplate({
					name: type + '-faxes',
					data: dataTemplate
				}));

			self.initDatePickerFaxboxes(type, parent, template);

			self.bindFaxboxes(type, template);

			parent
				.fadeOut(function() {
					$(this)
						.empty()
						.append(template)
						.fadeIn();
				});
		},

		initDatePickerFaxboxes: function(type, parent, template) {
			var self = this,
				dates = monster.util.getDefaultRangeDates(self.appFlags.ranges.default),
				fromDate = dates.from,
				toDate = dates.to;

			var optionsDatePicker = {
				container: template,
				range: self.appFlags.ranges.max
			};

			monster.ui.initRangeDatepicker(optionsDatePicker);

			template.find('#startDate').datepicker('setDate', fromDate);
			template.find('#endDate').datepicker('setDate', toDate);

			template.find('.apply-filter').on('click', function(e) {
				var faxboxId = template.find('#select_faxbox').val();

				self.displayListFaxes(type, parent, faxboxId);
			});

			template.find('.toggle-filter').on('click', function() {
				template.find('.filter-by-date').toggleClass('active');
			});
		},

		bindFaxboxes: function(type, template) {
			var self = this,
				$selectFaxbox = template.find('.select-faxbox');

			monster.ui.tooltips(template);
			monster.ui.footable(template.find('.footable'));

			monster.ui.chosen($selectFaxbox, {
				placeholder_text_single: self.i18n.active().fax.actionBar.selectFaxbox.none
			});

			$selectFaxbox.on('change', function() {
				var faxboxId = $(this).val();

				template.find('.select-faxbox').val(faxboxId).trigger('chosen:updated');

				self.displayListFaxes(type, template, faxboxId);
			});

			template.find('#refresh_faxbox').on('click', function() {
				var faxboxId = $selectFaxbox.val();

				if (faxboxId !== 'none') {
					self.displayListFaxes(type, template, faxboxId);
				}
			});

			template.find('#delete_faxes').on('click', function() {
				var faxboxId = $selectFaxbox.val(),
					listSelected = [],
					type = $(this).data('type');

				template.find('.select-fax:checked').each(function(a, el) {
					listSelected.push($(el).data('id'));
				});
				var content = self.getTemplate({
					name: '!' + self.i18n.active().fax.deleteConfirm.content,
					data: {
						variable: listSelected.length
					}
				});

				monster.ui.confirm(content, function() {
					template.find('.select-fax:checked').each(function(a, el) {
						listSelected.push($(el).data('id'));
					});

					template.find('.data-state')
							.hide();

					template.find('.loading-state')
							.show();

					self.deleteFaxes(listSelected, type, function() {
						toastr.success(self.i18n.active().fax.deleteConfirm.success);

						self.displayListFaxes(type, template, faxboxId);
					});
				}, undefined, {
					title: self.i18n.active().fax.deleteConfirm.title,
					confirmButtonText: self.i18n.active().fax.deleteConfirm.confirmButtonText,
					confirmButtonClass: 'monster-button-danger'
				});
			});

			template.find('#resend_faxes').on('click', function() {
				var faxboxId = $selectFaxbox.val(),
					listSelected = [];

				template.find('.select-fax:checked').each(function(a, el) {
					listSelected.push($(el).data('id'));
				});

				var content = self.getTemplate({
					name: '!' + self.i18n.active().fax.resendConfirm.content,
					data: {
						variable: listSelected.length
					}
				});
				monster.ui.confirm(content, function() {
					self.resendFaxes(listSelected, function() {
						toastr.success(self.i18n.active().fax.resendConfirm.success);

						self.displayListFaxes(type, template, faxboxId);
					});
				}, undefined, {
					title: self.i18n.active().fax.resendConfirm.title,
					confirmButtonText: self.i18n.active().fax.resendConfirm.confirmButtonText
				});
			});

			template.on('click', '.details-fax', function() {
				var id = $(this).parents('tr').data('id');

				self.renderDetailsFax(type, id);
			});

			function afterSelect() {
				if (template.find('.select-fax:checked').length) {
					template.find('.hidable').removeClass('hidden');
					template.find('.main-select-fax').prop('checked', true);
				} else {
					template.find('.hidable').addClass('hidden');
					template.find('.main-select-fax').prop('checked', false);
				}
			}

			template.on('click', '.select-fax', function() {
				afterSelect();
			});

			template.find('.main-select-fax').on('click', function() {
				var $this = $(this),
					isChecked = $this.prop('checked');

				template.find('.select-fax').prop('checked', isChecked);

				afterSelect();
			});

			template.find('.select-some-faxes').on('click', function() {
				var $this = $(this),
					type = $this.data('type');

				template.find('.select-fax').prop('checked', false);

				if (type !== 'none') {
					if (type === 'all') {
						template.find('.select-fax').prop('checked', true);
					} else {
						template.find('.select-fax[data-status="' + type + '"]').prop('checked', true);
					}
				}

				afterSelect();
			});

			template.on('click', '.select-line', function() {
				var cb = $(this).parents('.fax-row').find('.select-fax');

				cb.prop('checked', !cb.prop('checked'));
				afterSelect();
			});
		},

		displayListFaxes: function(type, container, faxboxId) {
			var self = this,
				fromDate = container.find('input.filter-from').datepicker('getDate'),
				toDate = container.find('input.filter-to').datepicker('getDate'),
				filterByDate = container.find('.filter-by-date').hasClass('active');

			container.removeClass('empty');

			// Gives a better feedback to the user if we empty it as we click... showing the user something is happening.
			container.find('.data-state')
						.hide();

			container.find('.loading-state')
						.show();

			container.find('.hidable').addClass('hidden');
			container.find('.main-select-fax').prop('checked', false);

			monster.ui.footable(container.find('.faxbox-table .footable'), {
				getData: function(filters, callback) {
					if (filterByDate) {
						filters = $.extend(true, filters, {
							created_from: monster.util.dateToBeginningOfGregorianDay(fromDate),
							created_to: monster.util.dateToEndOfGregorianDay(toDate)
						});
					}
					// we do this to keep context
					self.getRowsFaxes(type, filters, faxboxId, callback);
				},
				afterInitialized: function() {
					container.find('.data-state')
								.show();

					container.find('.loading-state')
								.hide();
				},
				backendPagination: {
					enabled: false
				}
			});
		},

		getRowsFaxes: function(type, filters, faxboxId, callback) {
			var self = this;

			self.getFaxMessages(type, filters, faxboxId, function(data) {
				var formattedData = self.formatFaxData(data.data, type),
					dataTemplate = {
						faxes: formattedData
					},
					$rows = $(self.getTemplate({
						name: type + '-faxes-rows',
						data: dataTemplate
					}));

				callback && callback($rows, data);
			});
		},

		getFaxMessages: function(type, filters, faxboxId, callback) {
			var self = this,
				resource = type === 'inbound' ? 'faxes.listInbound' : 'faxes.listOutbound';

			self.callApi({
				resource: resource,
				data: {
					accountId: self.accountId,
					//faxboxId: faxboxId, API Doesn't allow filter here for now, we'll do it in JS instead
					filters: filters
				},
				success: function(data) {
					var formattedData = data,
						filteredData = _.filter(data.data, function(a) {
							return a.faxbox_id === faxboxId;
						});

					formattedData.data = filteredData;

					callback && callback(formattedData);
				}
			});
		},

		formatFaxData: function(data, type) {
			var self = this;

			_.each(data, function(fax) {
				var details = fax.hasOwnProperty('rx_result') ? fax.rx_result : (fax.hasOwnProperty('tx_result') ? fax.tx_result : {});

				fax.status = details.success === true ? 'success' : 'failed';
				fax.formatted = {};

				if (details.success === false) {
					fax.formatted.error = details.result_text;
				}

				fax.formatted.timestamp = monster.util.toFriendlyDate(fax.created);
				fax.formatted.receivingFaxbox = self.appFlags.faxboxes.hasOwnProperty(fax.faxbox_id) ? self.appFlags.faxboxes[fax.faxbox_id].name : '-';
				fax.formatted.receivingNumber = monster.util.formatPhoneNumber(fax.to_number);
				fax.formatted.sendingFaxbox = self.appFlags.faxboxes.hasOwnProperty(fax.faxbox_id) ? self.appFlags.faxboxes[fax.faxbox_id].name : '-';
				fax.formatted.sendingNumber = monster.util.formatPhoneNumber(fax.from_number);
				fax.formatted.pages = details.hasOwnProperty('total_pages') ? details.total_pages : 0;
				fax.formatted.uri = self.formatFaxURI(fax.id, type);
			});

			return data;
		},

		formatFaxURI: function(mediaId, pType) {
			var self = this,
				type = pType === 'inbound' ? 'inbox' : 'outbox';

			return self.apiUrl + 'accounts/' + self.accountId + '/faxes/' + type + '/' + mediaId + '/attachment?auth_token=' + self.getAuthToken();
		},

		renderDetailsFax: function(type, id) {
			var self = this;

			self.getFaxDetails(type, id, function(faxDetails) {
				var template = $(self.getTemplate({
					name: 'fax-CDRDialog'
				}));

				monster.ui.renderJSON(faxDetails, template.find('#jsoneditor'));

				monster.ui.dialog(template, { title: self.i18n.active().fax.CDRPopup.title });
			});
		},

		getStorage: function(callback) {
			var self = this;

			self.callApi({
				resource: 'storage.get',
				data: {
					accountId: self.accountId,
					generateError: false
				},
				success: function(data) {
					callback(data.data);
				},
				error: function(data, error, globalHandler) {
					if (error.status === 404) {
						callback(undefined);
					} else {
						globalHandler(data);
					}
				}
			});
		},

		renderStorage: function(pArgs) {
			var self = this,
				args = pArgs || {},
				parent = args.container || $('#fax_app_container .app-content-wrapper');

			self.getStorage(function(storage) {
				var formattedData = self.storageFormatData(storage),
					template = $(self.getTemplate({
						name: 'storage',
						data: formattedData
					}));

				self.storageBindEvents(template);

				monster.pub('common.storagePlanManager.render', {
					container: template.find('.control-container'),
					forceTypes: ['fax'],
					hideOtherTypes: true
				});

				parent
					.fadeOut(function() {
						$(this)
							.empty()
							.append(template)
							.fadeIn();
					});
			});
		},

		storageBindEvents: function(template) {
			var self = this;
		},

		storageFormatData: function(data) {
			return data;
		},

		renderLogs: function(pArgs) {
			var self = this,
				args = pArgs || {},
				parent = args.container || $('#fax_app_container .app-content-wrapper');

			self.logsGetData(function(logs) {
				var formattedData = self.logsFormatDataTable(logs),
					template = $(self.getTemplate({
						name: 'logs-layout',
						data: {
							logs: formattedData
						}
					}));

				monster.ui.footable(template.find('.footable'));

				self.logsBindEvents(template);

				parent
					.fadeOut(function() {
						$(this)
							.empty()
							.append(template)
							.fadeIn();
					});
			});
		},

		logsBindEvents: function(template) {
			var self = this;

			template.on('click', '.detail-link', function() {
				var logId = $(this).parents('tr').data('id');

				self.logsRenderDetailPopup(logId);
			});
		},

		logsRenderDetailPopup: function(logId) {
			var self = this;

			self.logsGetDetails(logId, function(details) {
				var detailTemplate = $(self.getTemplate({
					name: 'logs-detail',
					data: details
				}));

				detailTemplate.find('#close').on('click', function() {
					popup.dialog('close').remove();
				});

				var popup = monster.ui.dialog(detailTemplate, {
					title: self.i18n.active().fax.logs.detailDialog.popupTitle,
					position: ['center', 20]
				});
			});
		},

		logsFormatDataTable: function(logs) {
			var self = this;

			_.each(logs, function(log) {
				log.formatted = {};
				log.formatted.hasError = log.hasOwnProperty('error');
				log.formatted.from = log.from || '-';
				log.formatted.to = log.to || '-';
				log.formatted.date = monster.util.toFriendlyDate(log.created);
			});

			return logs;
		},

		logsFormatDetailData: function(details) {
			var self = this,
				formattedData = {
					metadata: {},
					errors: []
				},
				formattedKey = '';

			_.each(details, function(value, key) {
				if (key === 'errors') {
					formattedData.errors = value;
				} else {
					formattedKey = self.i18n.active().fax.logs.detailDialog.apiKeys.hasOwnProperty(key) ? self.i18n.active().fax.logs.detailDialog.apiKeys[key] : key.replace(/_/g, ' ');
					formattedData.metadata[key] = {
						friendlyKey: formattedKey,
						value: value
					};
				}
			});

			return formattedData;
		},

		logsGetData: function(callback) {
			var self = this;

			self.callApi({
				resource: 'faxes.getLogs',
				data: {
					accountId: self.accountId
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		logsGetDetails: function(id, callback) {
			var self = this;

			self.callApi({
				resource: 'faxes.getLogDetails',
				data: {
					accountId: self.accountId,
					logId: id
				},
				success: function(data) {
					var formattedData = self.logsFormatDetailData(data.data);

					callback && callback(formattedData);
				}
			});
		},

		listFaxboxes: function(callback) {
			var self = this;

			self.callApi({
				resource: 'faxbox.list',
				data: {
					accountId: self.accountId,
					filters: {
						paginate: false
					}
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		getFaxDetails: function(type, faxId, callback) {
			var self = this,
				//resourceName = 'faxes.' + (type === 'inbound' ? 'getAttachmentInbound' : 'getAttachmentOutbound');
				resourceName = 'faxes.' + (type === 'inbound' ? 'getDetailsInbound' : 'getDetailsOutbound');

			self.callApi({
				resource: resourceName,
				data: {
					accountId: self.accountId,
					faxId: faxId
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		deleteFaxes: function(listFaxes, pType, globalCallback) {
			var self = this,
				type = pType === 'inbound' ? 'inbound' : 'outbound',
				requests = {};

			_.each(listFaxes, function(faxId) {
				requests[faxId] = function(callback) {
					self.deleteFax(faxId, type, function(data) {
						callback && callback(null, data);
					});
				};
			});

			monster.parallel(requests, function(err, results) {
				globalCallback && globalCallback(results);
			});
		},

		deleteFax: function(faxId, type, callback) {
			var self = this,
				resource = type === 'inbound' ? 'deleteInbound' : 'deleteOutbound';

			self.callApi({
				resource: 'faxes.' + resource,
				data: {
					accountId: self.accountId,
					faxId: faxId
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		resendFaxes: function(listFaxes, globalCallback) {
			var self = this,
				requests = {};

			_.each(listFaxes, function(faxId) {
				requests[faxId] = function(callback) {
					self.resendFax(faxId, function(data) {
						callback && callback(null, data);
					});
				};
			});

			monster.parallel(requests, function(err, results) {
				globalCallback && globalCallback(results);
			});
		},

		resendFax: function(faxId, callback) {
			var self = this;

			self.callApi({
				resource: 'faxes.updateOutbound',
				data: {
					accountId: self.accountId,
					faxId: faxId,
					data: {},
					envelopeKeys: {
						action: 'resubmit'
					}
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		}
	};

	return app;
});
