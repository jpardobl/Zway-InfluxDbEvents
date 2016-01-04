/*** InfluxDbEvents Z-Way HA module *******************************************

Version: 1.00
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: jpardobl
Description:
    Collects sensor events in an InfluxDB

******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function InfluxDbEvents (id, controller) {
    // Call superconstructor first (AutomationModule)
    InfluxDbEvents.super_.call(this, id, controller);
    
//    this.interval   = undefined;
    this.callbacks  = {};
    this.url        = undefined;
    this.langfile   = undefined;
}

inherits(InfluxDbEvents, AutomationModule);

_module = InfluxDbEvents;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

InfluxDbEvents.prototype.init = function (config) {
    console.log("[InfluxDbEvents] entering init");
    InfluxDbEvents.super_.prototype.init.call(this, config);
    var self = this;
    
    self.langFile   = self.controller.loadModuleLang("InfluxDbEvents");
    
    self.url = self.config.server
        + ':8086/write'
        + '?db='
        + encodeURIComponent(self.config.database);
    
    if (typeof(self.config.username) !== 'undefined') {
        self.url = self.url + '&u=' + encodeURIComponent(self.config.username);
    }
    if (typeof(self.config.password) !== 'undefined') {
        self.url = self.url + '&p=' + encodeURIComponent(self.config.password);
    }
    _.each(self.config.devices,function(deviceId){
        // Build, register and call check callback
        var device  = self.controller.devices.get(deviceId);
        console.log("[InfluxDbEvents] loop init: " + device);
    });
    console.log("[InfluxDbEvents] Ended init");
//    if (typeof(self.config.interval) !== 'undefined') {
//        var interval = parseInt(self.config.interval) * 60 * 1000;
//        console.log('[InfluxDb]'+self.url+' - '+interval);
//        self.interval = setInterval(_.bind(self.updateAll,self), interval);
//    }
    
    setTimeout(_.bind(self.initCallback,self),30 * 1000);
    //self.updateCalculation();
};

InfluxDbEvents.prototype.initCallback = function() {
    var self = this;
    
    _.each(self.config.devices,function(deviceId){
        // Build, register and call check callback
        console.log("[InfluxDbEvents] loop initcallback: " + deviceId);
        var device  = self.controller.devices.get(deviceId);
        if (device == 'null') {
            console.error('[InfluxDbEvents] Device not found '+deviceId);
        } else {
            console.log("[InfluxDbEvents] binding on change:metrics:level for device: " + deviceId);
            var callback = _.bind(self.updateDevice,self,deviceId);
            self.callbacks[deviceId] = callback;
            device.on('change:metrics:level',callback);
        }
    });
};

InfluxDbEvents.prototype.stop = function () {
    var self = this;
    
    // Remove callbacks
    _.each(self.config.devices,function(deviceId){
        self.controller.devices.off(deviceId, 'change:metrics:level', self.callbacks[deviceId]);
        self.callbacks[deviceId] = undefined;
    });
    self.callbacks = {};
    
    // Remove interval
//    if (typeof(self.interval) !== 'undefined') {
//        clearInterval(self.interval);
//    }
    
    InfluxDbEvents.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

InfluxDbEvents.prototype.updateDevice = function (deviceId) {
    var self = this;
    
    // TODO;Ensure that not called too often
    var lines = [
        self.collectDevice(deviceId)
    ];
    self.sendStats(lines);
};

InfluxDbEvents.prototype.escapeValue = function (value) {
    var self = this;
    
    switch(typeof(value)) {
        case 'number':
            return value;
            break;
        case 'string':
            return value.replace(/(,|\s+)/g, '\\$1');
            break;
    }
    return 'null';
};


InfluxDbEvents.prototype.collectDevice = function (deviceId) {
    var self    = this;
    var device  = self.controller.devices.get(deviceId);
    
    var level       = device.get('metrics:level');
    var scale       = device.get('metrics:scaleTitle');
    var probe       = device.get('metrics:probeTitle');
    var title       = device.get('metrics:title');
    var location    = parseInt(device.get('location'));
    var type        = device.get('deviceType');
    var room        = _.find(
        self.controller.locations, 
        function(item){ return (item.id === location) }
    );
    if (typeof(room) === 'object') {
        room = room.title;
    }
    level = self.parseLevel(level);

    if (scale == undefined || scale == "" ) scale = "B";

    return 'device.' + self.escapeValue(deviceId) +
        ',probe=' + self.escapeValue(probe) +
        ',room=' + self.escapeValue(room) +
        ',scale=' + self.escapeValue(scale) +
        ',title=' + self.escapeValue(title) +
        ',type=' + type +
        ' level=' + self.escapeValue(level);
};

InfluxDbEvents.prototype.parseLevel = function(level){
    if ((level - parseFloat( level ) + 1) >= 0) return level;
    if (level == "off") return 0;
    if (level == "on") return  1;
    console.warning("[InfluxDbEvents] Could not parse level: " + level);
    return "-";
};

InfluxDbEvents.prototype.sendStats = function (lines) {
    var self = this;
    
    if (lines.length === 0) {
        return;
    }
    var data = lines.join("\n");
    console.log("[InfluxDbEvents] data: " + data);
    http.request({
        url:    self.url,
        async:  true,
        method: 'POST',
        data:   data,
        error:  function(response) {
            console.error('[InfluxDbEvents] Could not post stats');
            console.logJS(response);
            
            self.controller.addNotification(
                "error", 
                self.langFile.error, 
                "module", 
                "InfluxDbEvents"
            );
        }
    });
};
