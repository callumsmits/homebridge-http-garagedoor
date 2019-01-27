"use strict";

let Service;
let Characteristic;
let DoorState;
const process = require("process");
const fetch = require("node-fetch");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  DoorState = homebridge.hap.Characteristic.CurrentDoorState;

  homebridge.registerAccessory(
    "homebridge-http-garagedoor",
    "HttpGarageDoor",
    HttpGarageDoorAccessory
  );
};

function HttpGarageDoorAccessory(log, config) {
  this.log = log;
  this.version = require("./package.json").version;
  log("HttpGarageDoorAccessory version " + this.version);

  this.name = config.name;
  this.host = config.host;
  const { sensorPollInMs = 4000, doorOpensInSeconds } = config;
  this.sensorPollInMs = sensorPollInMs;
  this.doorOpensInSeconds = doorOpensInSeconds;

  this.initService();
}

HttpGarageDoorAccessory.prototype = {
  doorStateToString: function(state) {
    switch (state) {
      case DoorState.OPEN:
        return "OPEN";
      case DoorState.CLOSED:
        return "CLOSED";
      case DoorState.STOPPED:
        return "STOPPED";
      case DoorState.OPENING:
        return "OPENING";
      case DoorState.CLOSING:
        return "CLOSING";
      default:
        return "UNKNOWN";
    }
  },

  monitorDoorState: async function() {
    var isClosed = await this.isClosed();
    if (isClosed != this.wasClosed) {
      var state = await this.determineCurrentDoorState();
      if (!this.operating) {
        this.log("Door state changed to " + this.doorStateToString(state));
        this.wasClosed = isClosed;
        this.currentDoorState.updateValue(state);
        this.targetState = state;
      }
    }
    setTimeout(this.monitorDoorState.bind(this), this.sensorPollInMs);
  },

  initService: function() {
    this.garageDoorOpener = new Service.GarageDoorOpener(this.name, this.name);
    this.currentDoorState = this.garageDoorOpener.getCharacteristic(DoorState);
    this.targetDoorState = this.garageDoorOpener.getCharacteristic(
      Characteristic.TargetDoorState
    );

    this.isClosed = async () => {
      try {
        const res = await fetch(`http://${this.host}/doorClosedState`);
        const json = await res.json();
        return json.doorClosedState;
      }
      catch (_e) {
        return -1;
      }
    };

    this.isOpen = async () => !(await this.isClosed());

    this.determineCurrentDoorState = async () => {
      if (await this.isClosed()) {
        return DoorState.CLOSED;
      } else {
        return DoorState.OPEN;
      }
    };
  
    this.triggerDoor = () => {
      fetch(`http://${this.host}/triggerMovement`).catch(() => {});
    };

    this.getTargetState = callback => {
      callback(null, this.targetState);
    };

    this.setFinalDoorState = async () => {
      const isClosed = await this.isClosed();
      const isOpen = this.isOpen();
      if (
        (this.targetState == DoorState.CLOSED && !isClosed) ||
        (this.targetState == DoorState.OPEN && !isOpen)
      ) {
        this.log(
          "Was trying to " +
            (this.targetState == DoorState.CLOSED ? "CLOSE" : "OPEN") +
            " the door, but it is still " +
            (isClosed ? "CLOSED" : "OPEN")
        );
        this.currentDoorState.updateValue(DoorState.STOPPED);
      } else {
        this.log(
          "Set current state to " +
            (this.targetState == DoorState.CLOSED ? "CLOSED" : "OPEN")
        );
        this.wasClosed = this.targetState == DoorState.CLOSED;
        this.currentDoorState.updateValue(this.targetState);
      }
      this.operating = false;
    };
    
    this.setState = async (state, callback) => {
      this.log("Setting state to " + state);
      this.targetState = state;
      const isClosed = await this.isClosed();
      if (
        (state === DoorState.OPEN && isClosed) ||
        (state === DoorState.CLOSED && !isClosed)
      ) {
        this.log("Triggering GarageDoor");
        this.operating = true;
        this.currentDoorState.updateValue(
          state === DoorState.OPEN ? DoorState.OPENING : DoorState.CLOSING
        );
        setTimeout(this.setFinalDoorState, this.doorOpensInSeconds * 1000);
        this.triggerDoor();
      }
  
      callback();
      return true;
    };

    this.getState = async callback => {
      const isClosed = await this.isClosed();
      const isOpen = this.isOpen();
      const state = isClosed
        ? DoorState.CLOSED
        : isOpen ? DoorState.OPEN : DoorState.STOPPED;
      this.log(
        "GarageDoor is " +
          (isClosed
            ? "CLOSED (" + DoorState.CLOSED + ")"
            : isOpen
              ? "OPEN (" + DoorState.OPEN + ")"
              : "STOPPED (" + DoorState.STOPPED + ")")
      );
      callback(null, state);
    };

    this.currentDoorState.on("get", this.getState);

    this.targetDoorState.on("set", this.setState);
    this.targetDoorState.on("get", this.getTargetState);

    const isClosed = DoorState.CLOSED;

    this.wasClosed = isClosed;
    this.operating = false;
    this.infoService = new Service.AccessoryInformation();
    this.infoService
      .setCharacteristic(Characteristic.Manufacturer, "Opensource Community")
      .setCharacteristic(Characteristic.Model, "Http GarageDoor")
      .setCharacteristic(Characteristic.SerialNumber, "Version 0.0.1");

    setTimeout(this.monitorDoorState.bind(this), this.sensorPollInMs);

    this.log("Sensor Poll in ms: " + this.sensorPollInMs);
    this.log("Door Opens in seconds: " + this.doorOpensInSeconds);
    this.log(`Garage host: ${this.host}`);
  
    this.log("Initial Door State: " + (isClosed ? "CLOSED" : "OPEN"));
    this.currentDoorState.updateValue(
      isClosed ? DoorState.CLOSED : DoorState.OPEN
    );
    this.targetDoorState.updateValue(
      isClosed ? DoorState.CLOSED : DoorState.OPEN
    );
  },

  getServices: function() {
    return [this.infoService, this.garageDoorOpener];
  }
};
