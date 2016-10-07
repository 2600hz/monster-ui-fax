define(function(require){
	var $ = require('jquery'),
		_ = require('underscore'),
		monster = require('monster'),
		chosen = require('chosen'),
		toastr = require('toastr');

	var app = {
		name: 'fax',

		css: [ 'app' ],

		i18n: { 
			'en-US': { customCss: false }
		},

		requests: {},
		subscribe: {},

		load: function(callback){
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

			self.listFaxboxes(function(faxboxes) {
				self.appFlags.faxboxes = _.indexBy(faxboxes, 'id');

				monster.ui.generateAppLayout(self, {
					menus: [
						{
							tabs: [
								{
									text: self.i18n.active().fax.menuTitles.inbound,
									callback: self.renderInbound
								},
								{
									text: self.i18n.active().fax.menuTitles.outbound,
									callback: self.renderOutbound
								},
								{
									text: self.i18n.active().fax.menuTitles.logs,
									callback: self.renderLogs
								}
							]
						}
					]
				});
			});
		},

		renderFaxes: function(pArgs) {
			var self = this,
				args = pArgs || {},
				parent = args.container || $('#fax_app_container .app-content-wrapper'),
				dates = monster.util.getDefaultRangeDates(self.appFlags.ranges.default),
				fromDate = dates.from,
				toDate = dates.to,
				type = pArgs.type;

			var template = $(monster.template(self, type + '-faxes', { faxboxes: self.appFlags.faxboxes }));

			self.bindCommon(template);

			if(type === 'inbound') {
				self.bindInbound(template);
			}
			else {
				self.bindOutbound(template);
			}

			self.initDatePicker(template, fromDate, toDate);

			parent
				.fadeOut(function() {
					$(this)
						.empty()
						.append(template)
						.fadeIn();
				});

			self.displayFaxesList(type, template, fromDate, toDate);
		},

		renderInbound: function(pArgs) {
			var self = this;

			pArgs.type = 'inbound';

			self.renderFaxes(pArgs);
		},

		renderOutbound: function(pArgs) {
			var self = this;

			pArgs.type = 'outbound';

			self.renderFaxes(pArgs);
		},

		displayFaxesList: function(type, container, fromDate, toDate, selectedFaxbox) {
			var self = this;

			container.find('.data-state')
					 .hide();

			container.find('.loading-state')
					 .show();

			self.getTemplateData(type, container, fromDate, toDate, selectedFaxbox, function(template) {
				monster.ui.footable(template.find('.footable'));
				self.bindTableCommon(template);

				container.removeClass('empty');

				container.find('.main-select-message').prop('checked', false);

				container.find('.data-state')
						 .empty()
						 .append(template)
						 .show();

				container.find('.loading-state')
						 .hide();

				if(selectedFaxbox && selectedFaxbox !== 'none') {
					container.find('#select_faxbox').val(selectedFaxbox).trigger('change');
				}
			});
		},

		getTemplateData: function(type, container, fromDate, toDate, selectedFaxbox, callback) {
			var self = this;

			if(type === 'inbound') {
				self.getInboundData(fromDate, toDate, function(data) {
					var dataTemplate = self.formatInboundData(data),
						template = $(monster.template(self, 'inbound-faxes-list', { faxes: dataTemplate }));

					callback && callback(template);
				});
			}
			else {
				self.getOutboundData(fromDate, toDate, function(data) {
					var dataTemplate = self.formatOutboundData(data),
						template = $(monster.template(self, 'outbound-faxes-list', { faxes: dataTemplate }));

					callback && callback(template);
				});
			}
		},

		bindTableCommon: function(template) {
			var self = this;

			template.find('#fax_list').on('click', '.details-fax', function() {
				var $this = $(this),
					type = $this.parents('.faxes-table').data('type'),
					id = $(this).parents('tr').data('id');

				self.renderDetailsFax(type, id);
			});
		},

		renderDetailsFax: function(type, id) {
			var self = this;

			self.getFaxDetails(type, id, function(faxDetails) {
				var template = $(monster.template(self, 'fax-CDRDialog'));

				monster.ui.renderJSON(faxDetails, template.find('#jsoneditor'));

				monster.ui.dialog(template, { title: self.i18n.active().fax.CDRPopup.title });
			});
		},

		initDatePicker: function(template, fromDate, toDate) {
			var self = this;

			var optionsDatePicker = {
				container: template,
				range: self.appFlags.ranges.max
			};

			monster.ui.initRangeDatepicker(optionsDatePicker);

			template.find('#startDate').datepicker('setDate', fromDate);
			template.find('#endDate').datepicker('setDate', toDate);

			template.find('.apply-filter').on('click', function(e) {
				self.refreshFaxes(template);
			});
		},

		refreshFaxes: function(template) {
			var self = this,
				type = template.hasClass('inbound-faxes') ? 'inbound' : 'outbound',
				fromDate = template.find('input.filter-from').datepicker("getDate"),
				toDate = template.find('input.filter-to').datepicker("getDate"),
				selectedFaxbox = template.find('#select_faxbox').val();

			self.displayFaxesList(type, template, fromDate, toDate, selectedFaxbox)
		},

		bindCommon: function(template) {
			var self = this,
				currentVM,
				$selectFaxbox = template.find('#select_faxbox');

			monster.ui.tooltips(template);

			$selectFaxbox.chosen({search_contains: true, width: '220px', placeholder_text_single: self.i18n.active().fax.actionBar.selectFax.none });

			$selectFaxbox.on('change', function(e) {
				var filtering = FooTable.get('#fax_list').use(FooTable.Filtering),
					filter = $(this).val();

				if(filter === 'all') {
					filtering.removeFilter('faxbox_filter');
				}
				else {
					filtering.addFilter('faxbox_filter', filter, [0]);
				}

				filtering.filter();

				afterSelect();
			});

			function afterSelect() {
				if(template.find('.select-fax:checked').length) {
					template.find('.main-select-fax').prop('checked', true);
					template.find('.actionable').show();
				}
				else{
					template.find('.main-select-fax').prop('checked', false);
					template.find('.actionable').hide();
				}
			}

			template.find('#refresh_faxbox').on('click', function() {
				self.refreshFaxes(template);
			});

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

				if(type !== 'none') {
					if(type === 'all') {
						template.find('.select-fax').prop('checked', true);
					}
					else {
						template.find('.select-fax[data-status="' + type + '"]').prop('checked', true);
					}
				}

				afterSelect();
			});

			template.find('#delete_faxes').on('click', function() {
				var listSelected = [],
					type = $(this).data('type');

				template.find('.select-fax:checked').each(function(a, el) {
					listSelected.push($(el).data('id'));
				});
				var content = monster.template(self, '!'+ self.i18n.active().fax.deleteConfirm.content, { variable: listSelected.length });

				monster.ui.confirm(content, function() {
					template.find('.select-fax:checked').each(function(a, el) {
						listSelected.push($(el).data('id'));
					});

					self.deleteFaxes(listSelected, type, function() {
						toastr.success(self.i18n.active().fax.deleteConfirm.success);

						self.refreshFaxes(template);
					});
				}, undefined, {
					title: self.i18n.active().fax.deleteConfirm.title,
					confirmButtonText: self.i18n.active().fax.deleteConfirm.confirmButtonText,
					confirmButtonClass: 'monster-button-danger'
				});
			});
		},

		bindInbound: function(template) {
			var self = this;
		},

		bindOutbound: function(template) {
			var self = this;

			template.find('#resend_faxes').on('click', function() {
				var listSelected = [];
				template.find('.select-fax:checked').each(function(a, el) {
					listSelected.push($(el).data('id'));
				});
				var content = monster.template(self, '!'+ self.i18n.active().fax.resendConfirm.content, { variable: listSelected.length });

				monster.ui.confirm(content, function() {
					self.resendFaxes(listSelected, function() {
						toastr.success(self.i18n.active().fax.resendConfirm.success);

						self.refreshFaxes(template);
					});
				}, undefined, {
					title: self.i18n.active().fax.resendConfirm.title,
					confirmButtonText: self.i18n.active().fax.resendConfirm.confirmButtonText
				});
			});
		},

		getInboundData: function(fromDate, toDate, callback) {
			var self = this;

			self.getInboundFaxes(fromDate, toDate, function(faxes) {
				callback && callback(faxes)
			});
		},

		getOutboundData: function(fromDate, toDate, callback) {
			var self = this;

			self.getOutboundFaxes(fromDate, toDate, function(faxes) {
				callback && callback(faxes)
			});
		},

		formatInboundData: function(data) {
			var self = this,
				formattedFaxes = self.formatFaxes(data, 'inbound');

			return formattedFaxes;
		},

		formatOutboundData: function(data) {
			var self = this,
				formattedFaxes = self.formatFaxes(data, 'outbound');

			return formattedFaxes;
		},

		formatFaxes: function(data, type) {
			var self = this;

			_.each(data, function(fax) {
				var details = fax.hasOwnProperty('rx_result') ? fax.rx_result : (fax.hasOwnProperty('tx_result') ? fax.tx_result : {});

				fax.status = details.success === true ? 'success' : 'failed';
				fax.formatted = {};

				if(details.success === false) {
					fax.formatted.error = details.result_text;
				}

				fax.formatted.timestamp = monster.util.toFriendlyDate(fax.hasOwnProperty('timestamp') ? fax.timestamp : details.pvt_delivered_date);
				fax.formatted.receivingFaxbox = self.appFlags.faxboxes.hasOwnProperty(fax.faxbox_id) ? self.appFlags.faxboxes[fax.faxbox_id].name : '-';
				fax.formatted.receivingNumber = monster.util.formatPhoneNumber(fax.to_number);
				fax.formatted.sendingFaxbox = self.appFlags.faxboxes.hasOwnProperty(fax.faxbox_id) ? self.appFlags.faxboxes[fax.faxbox_id].name : '-';
				fax.formatted.sendingNumber = monster.util.formatPhoneNumber(fax.from_number);
				fax.formatted.pages = details.hasOwnProperty('total_pages') ? details.total_pages : self.i18n.active().fax.table.noData;
				fax.formatted.uri = self.formatFaxURI(fax.id, type);
			});

			return data;
		},

		formatFaxURI: function(mediaId, pType) {
			var self = this,
				type = pType === 'inbound' ? 'inbox' : 'outbox';

			return self.apiUrl + 'accounts/' + self.accountId + '/faxes/'+ type +'/' + mediaId + '/attachment?auth_token=' + self.getAuthToken();
		},

		oldRenderLogs: function(pArgs) {
			var self = this,
				args = pArgs || {},
				parent = args.container || $('#fax_app_container .app-content-wrapper'),
				template = $(monster.template(self, 'logs-layout'));

			self.logsInitTable(template, function() {
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

		renderLogs: function(pArgs) {
			var self = this,
				args = pArgs || {},
				parent = args.container || $('#fax_app_container .app-content-wrapper');

			self.logsGetData(function(logs) {
				var formattedData = self.logsFormatDataTable(logs),
					template = $(monster.template(self, 'logs-layout', { logs: formattedData }));

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

			template.on('click','.detail-link', function() {
				var logId = $(this).parents('tr').data('id');

				self.logsRenderDetailPopup(logId);
			});
		},

		logsRenderDetailPopup: function(logId) {
			var self = this;

			self.logsGetDetails(logId, function(details) {
				var detailTemplate = $(monster.template(self, 'logs-detail', details));

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
			var self = this,
				formattedArray = [];

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
				if(key === 'errors') {
					formattedData.errors = value;
				}
				else {
					formattedKey = self.i18n.active().fax.logs.detailDialog.apiKeys.hasOwnProperty(key) ? self.i18n.active().fax.logs.detailDialog.apiKeys[key] : key.replace(/_/g, ' ');
					formattedData.metadata[key] = {
						friendlyKey: formattedKey,
						value: value
					}
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

		getInboundFaxes: function(fromDate, toDate, callback) {
			var self = this;

			self.callApi({
				resource: 'faxes.listInbound',
				data: {
					accountId: self.accountId,
					filters: {
						created_from: monster.util.dateToBeginningOfGregorianDay(fromDate),
						created_to:  monster.util.dateToEndOfGregorianDay(toDate),
						paginate: false
					},

				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		getOutboundFaxes: function(fromDate, toDate, callback) {
			var self = this;

			self.callApi({
				resource: 'faxes.listOutbound',
				data: {
					accountId: self.accountId,
					filters: {
						created_from: monster.util.dateToBeginningOfGregorianDay(fromDate),
						created_to:  monster.util.dateToEndOfGregorianDay(toDate),
						paginate: false
					},

				},
				success: function(data) {
					callback && callback(data.data);
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
				}
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

		resendFaxes: function(listFaxes, callback) {
			var self = this,
				requests = {};

			_.each(listFaxes, function(faxId) {
				requests[faxId] = function(callback) {
					self.resendFax(faxId,  function(data) {
						callback && callback(null, data);
					});
				}
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