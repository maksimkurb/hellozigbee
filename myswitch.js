const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const utils = require('zigbee-herdsman-converters/lib/utils');

const e = exposes.presets;
const ea = exposes.access;

// A subset of data types defined in dataType.ts (zigbee-herdsman project)
const DataType = {
    uint16: 0x21,
    enum8: 0x30,
}

const switchTypeValues = ['toggle', 'momentary', 'multifunction'];
const switchActionValues = ['onOff', 'offOn', 'toggle'];
const relayModeValues = ['unlinked', 'front', 'single', 'double', 'tripple', 'long'];


const manufacturerOptions = {
    jennic : {manufacturerCode: 0x1037}
}

const getKey = (object, value) => {
    for (const key in object) {
        if (object[key] == value) return key;
    }
};

const fromZigbeeConverter = {
    cluster: 'genOnOffSwitchCfg',
    type: ['attributeReport', 'readResponse'],

    convert: (model, msg, publish, options, meta) => {

        meta.logger.debug(`+_+_+_ fromZigbeeConverter() msg.endpoint=[${JSON.stringify(msg.endpoint)}], msg.device=[${JSON.stringify(msg.device)}]`);
        meta.logger.debug(`+_+_+_ fromZigbeeConverter() model=[${JSON.stringify(model)}]`);
        meta.logger.debug(`+_+_+_ fromZigbeeConverter() msg=[${JSON.stringify(msg)}]`);
        meta.logger.debug(`+_+_+_ fromZigbeeConverter() publish=[${JSON.stringify(publish)}]`);
        meta.logger.debug(`+_+_+_ fromZigbeeConverter() options=[${JSON.stringify(options)}]`);

        const ep_name = getKey(model.endpoint(msg.device), msg.endpoint.ID);
        const result = {};

        // switch type
        if(msg.data.hasOwnProperty('65280')) {
            result[`switch_type_${ep_name}`] = switchTypeValues[msg.data['65280']];
        }

        // switch action
        if(msg.data.hasOwnProperty('switchActions')) { // use standard 'switchActions' attribute identifier
            result[`switch_actions_${ep_name}`] = switchActionValues[msg.data['switchActions']];
        }

        // relay mode
        if(msg.data.hasOwnProperty('65281')) {
            result[`relay_mode_${ep_name}`] = relayModeValues[msg.data['65281']];
        }


        // Maximum pause between button clicks to be treates a single multiclick
        if(msg.data.hasOwnProperty('65282')) {
            result[`max_pause_${ep_name}`] = msg.data['65282'];
        }

        // Munimal duration for the long press
        if(msg.data.hasOwnProperty('65283')) {
            result[`min_long_press_${ep_name}`] = msg.data['65283'];
        }

        meta.logger.debug(`+_+_+_ fromZigbeeConverter() result=[${JSON.stringify(result)}]`);
        return result;
    },
}


const toZigbeeConverter = {
    key: ['switch_type', 'switch_actions', 'relay_mode', 'max_pause', 'min_long_press'],

    convertGet: async (entity, key, meta) => {
        meta.logger.debug(`+_+_+_ toZigbeeConverter::convertGet() key=${key}, entity=[${JSON.stringify(entity)}]`);

        if(key == 'switch_actions') {
            meta.logger.debug(`+_+_+_ #1 getting value for key=[${key}]`);
            await entity.read('genOnOffSwitchCfg', ['switchActions']);
        }
        else {
            const lookup = {
                switch_type: 65280,
                relay_mode: 65281,
                max_pause: 65282,
                min_long_press: 65283
            };
            meta.logger.debug(`+_+_+_ #2 getting value for key=[${lookup[key]}]`);
            await entity.read('genOnOffSwitchCfg', [lookup[key]], manufacturerOptions.jennic);
        }
    },

    convertSet: async (entity, key, value, meta) => {

        meta.logger.debug(`+_+_+_ toZigbeeConverter::convertSet() key=${key}, value=[${value}], epName=[${meta.endpoint_name}], entity=[${JSON.stringify(entity)}]`);

        let payload = {};
        let newValue = value;

        switch(key) {
            case 'switch_type':
                newValue = switchTypeValues.indexOf(value);
                payload = {65280: {'value': newValue, 'type': DataType.enum8}};
                meta.logger.debug(`payload=[${JSON.stringify(payload)}]`);
                await entity.write('genOnOffSwitchCfg', payload, manufacturerOptions.jennic);
                break;

            case 'switch_actions':
                newValue = switchActionValues.indexOf(value);
                payload = {switchActions: newValue};
                meta.logger.debug(`payload=[${JSON.stringify(payload)}]`);
                await entity.write('genOnOffSwitchCfg', payload);
                break;

            case 'relay_mode':
                newValue = relayModeValues.indexOf(value);
                payload = {65281: {'value': newValue, 'type': DataType.enum8}};
                await entity.write('genOnOffSwitchCfg', payload, manufacturerOptions.jennic);
                break;

            case 'max_pause':
                payload = {65282: {'value': value, 'type': DataType.uint16}};
                await entity.write('genOnOffSwitchCfg', payload, manufacturerOptions.jennic);
                break;

            case 'min_long_press':
                payload = {65283: {'value': value, 'type': DataType.uint16}};
                await entity.write('genOnOffSwitchCfg', payload, manufacturerOptions.jennic);
                break;

            default:
                meta.logger.debug(`convertSet(): Unrecognized key=${key} (value=${value})`);
                break;
        }

        result = {state: {[key]: value}}
        meta.logger.debug(`result2=[${JSON.stringify(result)}]`);
        return result;
    },
}


function genEndpoint(epName) {
    return [
        e.switch().withEndpoint(epName),
        exposes.enum('switch_type', ea.ALL, switchTypeValues).withEndpoint(epName),
        exposes.enum('switch_actions', ea.ALL, switchActionValues).withEndpoint(epName),
        exposes.enum('relay_mode', ea.ALL, relayModeValues).withEndpoint(epName),
        exposes.numeric('max_pause', ea.ALL).withEndpoint(epName),
        exposes.numeric('min_long_press', ea.ALL).withEndpoint(epName),
    ]
}

function genEndpoints(endpoinsCount) {
    let features = [];

    for (let i = 1; i <= endpoinsCount; i++) {
        const epName = `button_${i}`;
        features.push(...genEndpoint(epName));
    }

    return features;
}


const my_on_off = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.data.hasOwnProperty('onOff')) {

            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() msg.endpoint=[${JSON.stringify(msg.endpoint)}], msg.device=[${JSON.stringify(msg.device)}]`);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() model=[${JSON.stringify(model)}]`);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() msg=[${JSON.stringify(msg)}]`);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() publish=[${JSON.stringify(publish)}]`);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() options=[${JSON.stringify(options)}]`);

            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() has meta [${model.hasOwnProperty('meta')}]`);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() has multiEndpoint [${meta.hasOwnProperty('multiEndpoint')}]`);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() multiEndpoint=[${meta.multiEndpoint}]`);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() has endpoint [${model.hasOwnProperty('endpoint')}]`);

            const ep_name = getKey(model.endpoint(msg.device), msg.endpoint.ID);
//            const property = `state_${ep_name}`

            const property = utils.postfixWithEndpointName('state', msg, model);
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() property=[${property}]`);

            const result = {[property]: msg.data['onOff'] === 1 ? 'ON' : 'OFF'};
            meta.logger.debug(`+_+_+_ my_on_off::fromZigbee() result=[${JSON.stringify(result)}]`);
            return result;
        }
    }
}


const device = {
    zigbeeModel: ['Hello Zigbee Switch'],
    model: 'Hello Zigbee Switch',
    vendor: 'NXP',
    description: 'Hello Zigbee Switch',
    fromZigbee: [tz.on_off, fromZigbeeConverter],
    toZigbee: [tz.on_off, toZigbeeConverter],
//    exposes: [ e.battery() /*, e.action(['*_single', '*_double', '*_triple', '*_quadruple', '*_release'])*/].concat(genEndpoints(1)),
    exposes: genEndpoints(1),
    endpoint: (device) => {
        return {button_1: 2};
    },
    meta: {multiEndpoint: true},
};

module.exports = device;
