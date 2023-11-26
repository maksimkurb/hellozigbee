# To run these tests install pytest, then run this command line:
# py.test -rfeEsxXwa --verbose --showlocals

import pytest
import time

from device import *
from zigbee import *
from conftest import *

class SmartSwitch:
    """ 
    Smart Switch Test Harness

    This is a helper object that simplifies operating with the device via both UART and MQTT, performs routine checks,
    and moves communication burden from the test to the test harness.
    """

    def __init__(self, device, zigbee, ep, z2m_name):
        # Remember parameters for further use
        self.device = device
        self.zigbee = zigbee
        self.ep = ep
        self.button = ep-1
        self.z2m_name = z2m_name

        # Most of the tests will require device state MQTT messages. Subscribe for them
        self.zigbee.subscribe()

        # Unbind also from all clusters that are possibly were bound by previous tests
        send_unbind_request(self.zigbee, "genLevelCtrl", f"my_test_switch/{self.ep}", "Coordinator")


    def reset(self):
        self.device.reset()


    def get_state_change_msg(self, expected_state):
        return f"SwitchEndpoint EP={self.ep}: do state change {1 if expected_state else 0}"


    def switch(self, cmd, expected_state):
        msg = self.get_state_change_msg(expected_state)
        return set_device_attribute(self.device, self.zigbee, 'state_'+self.z2m_name, cmd, msg)


    def get_state(self):
        msg = f"ZCL Read Attribute: EP={self.ep} Cluster=0006 Command=00 Attr=0000"
        return get_device_attribute(self.device, self.zigbee, 'state_'+self.z2m_name, msg)


    def wait_state_change_msg(self, expected_state):
        msg = self.get_state_change_msg(expected_state)
        self.device.wait_str(msg)


    def get_attr_id_by_name(self, attr):
        match attr:
            case 'switch_mode':
                return 'ff00'
            case 'switch_actions':
                return '0010'
            case 'relay_mode':
                return 'ff01'
            case 'max_pause':
                return 'ff02'
            case 'min_long_press':
                return 'ff03'
            case 'long_press_mode':
                return 'ff04'
            case _:
                raise RuntimeError("Unknown attribute name")


    def set_attribute(self, attr, value):
        msg = f"ZCL Write Attribute: Cluster 0007 Attrib {self.get_attr_id_by_name(attr)}"
        return set_device_attribute(self.device, self.zigbee, attr + '_' + self.z2m_name, value, msg)


    def get_attribute(self, attr):
        msg = f"ZCL Read Attribute: EP={self.ep} Cluster=0007 Command=00 Attr={self.get_attr_id_by_name(attr)}"
        return get_device_attribute(self.device, self.zigbee, attr + '_' + self.z2m_name, msg)


    def press_button(self):
        cmd = f"BTN{self.button}_PRESS"
        self.device.send_str(cmd)


    def release_button(self):
        cmd = f"BTN{self.button}_RELEASE"
        self.device.send_str(cmd)


    def wait_button_state(self, state):
        state_str = f"Switching button {self.ep} state to {state}"
        self.device.wait_str(state_str)


    def wait_report_multistate(self, value):
        state_str = f"Reporting multistate action EP={self.ep} value={value}... status: 00"
        self.device.wait_str(state_str)


    def wait_report_level_ctrl(self, cmd):
        state_str = f"Sending Level Control {cmd} command status: 00"
        self.device.wait_str(state_str)


    def wait_zigbee_state(self):
        return self.zigbee.wait_msg()



# Make each test that uses switch fixture to run twice for both buttons. 
# Using the ids parameter the button name will be displayed as a test parameter
@pytest.fixture(params = [(2, "button_1"), (3, "button_2")], ids=lambda x: x[1])
def switch(device, zigbee, request):
    return SmartSwitch(device, zigbee, request.param[0], request.param[1])


def test_on_off(switch):
    assert switch.switch('ON', True) == 'ON'
    assert switch.switch('OFF', False) == 'OFF'


def test_toggle(switch):
    assert switch.switch('OFF', False) == 'OFF'
    assert switch.get_state() == 'OFF'

    assert switch.switch('TOGGLE', True) == 'ON'
    assert switch.get_state() == 'ON'

    assert switch.switch('TOGGLE', False) == 'OFF'
    assert switch.get_state() == 'OFF'


@pytest.mark.parametrize("switch_mode", ["toggle", "momentary", "multifunction"])
def test_oosc_attribute_switch_mode(switch, switch_mode):
    assert switch.set_attribute('switch_mode', switch_mode) == switch_mode
    assert switch.get_attribute('switch_mode') == switch_mode


@pytest.mark.parametrize("switch_actions", ["onOff", "offOn", "toggle"])
def test_oosc_attribute_switch_action(switch, switch_actions):
    assert switch.set_attribute('switch_actions', switch_actions) == switch_actions
    assert switch.get_attribute('switch_actions') == switch_actions


@pytest.mark.parametrize("relay_mode", ["unlinked", "front", "single", "double", "tripple", "long"])
def test_oosc_attribute_relay_mode(switch, relay_mode):
    assert switch.set_attribute('relay_mode', relay_mode) == relay_mode
    assert switch.get_attribute('relay_mode') == relay_mode


def test_oosc_attributes_survive_reboot(switch):
    # Set a specific OOSC options
    assert switch.set_attribute('switch_mode', 'multifunction') == 'multifunction'
    assert switch.set_attribute('relay_mode', 'double') == 'double'
    assert switch.set_attribute('long_press_mode', 'levelCtrlUp') == 'levelCtrlUp'
    assert switch.set_attribute('max_pause', '152') == '152'
    assert switch.set_attribute('min_long_press', '602') == '602'

    # Reset the device
    switch.reset()

    # Expect the OOSC settings survive the reboot
    assert switch.get_attribute('switch_mode') == 'multifunction'
    assert switch.get_attribute('relay_mode') == 'double'
    assert switch.get_attribute('long_press_mode') == 'levelCtrlUp'
    assert switch.get_attribute('max_pause') == 152
    assert switch.get_attribute('min_long_press') == 602


def test_btn_press(switch):
    # Ensure the switch is off on start, and the mode is 'toggle'
    assert switch.switch('OFF', False) == 'OFF'
    assert switch.set_attribute('switch_mode', 'toggle') == 'toggle'

    # Emulate short button press
    switch.press_button()
    switch.wait_button_state("PRESSED1")

    # In the toggle mode the switch is triggered immediately on button press
    switch.wait_state_change_msg(True)

    # Release the button
    switch.release_button()
    switch.wait_button_state("IDLE")

    # Check the device state changed, and the action is generated (in this particular order)
    assert switch.wait_zigbee_state()['action'] == "single_" + switch.z2m_name
    assert switch.wait_zigbee_state()['state_' + switch.z2m_name] == "ON"


def test_double_click(switch):
    # Ensure the switch is off on start, the mode is 'multifunction', and relay mode is 'double'
    assert switch.switch('OFF', False) == 'OFF'
    assert switch.set_attribute('switch_mode', 'multifunction') == 'multifunction'
    assert switch.set_attribute('relay_mode', 'double') == 'double'

    # Emulate the first click
    switch.press_button()
    switch.wait_button_state("PRESSED1")
    switch.release_button()
    switch.wait_button_state("PAUSE1")

    # Emulate the second click
    switch.press_button()
    switch.wait_button_state("PRESSED2")
    switch.release_button()
    switch.wait_button_state("PAUSE2")

    # We expect the LED to toggle after the second button click
    switch.wait_state_change_msg(True)

    # Check the device state changed, and the double click action is generated
    assert switch.wait_zigbee_state()['action'] == "double_" + switch.z2m_name
    assert switch.wait_zigbee_state()['state_' + switch.z2m_name] == "ON"


def test_level_control(switch):
    # Bind the endpoint with the coordinator
    send_bind_request(switch.zigbee, "genLevelCtrl", f"my_test_switch/{switch.ep}", "Coordinator")
    
    # Ensure the switch will generate levelCtrlDown messages on long press
    assert switch.set_attribute('switch_mode', 'multifunction') == 'multifunction'
    assert switch.set_attribute('relay_mode', 'unlinked') == 'unlinked'
    assert switch.set_attribute('long_press_mode', 'levelCtrlDown') == 'levelCtrlDown'

    # Emulate the long button press, wait until the switch transits to the long press state
    switch.press_button()
    switch.wait_button_state("PRESSED1")
    switch.wait_button_state("LONG_PRESS")
    switch.wait_report_multistate(255)  # 255 means button long press
    switch.wait_report_level_ctrl("Move")

    # Verify the Level Control Move command has been received by the coordinator
    assert switch.wait_zigbee_state()['action'] == "hold_" + switch.z2m_name
    assert switch.wait_zigbee_state()['level_ctrl'] == {'command': 'commandMove', 'payload': {'movemode': 1, 'rate': 80}}

    # Do not forget to release the button
    switch.release_button()
    switch.wait_button_state("IDLE")
    switch.wait_report_multistate(0)
    switch.wait_report_level_ctrl("Stop")

    # Verify the Level Control Move command has been received by the coordinator
    assert switch.wait_zigbee_state()['action'] == "release_" + switch.z2m_name
    assert switch.wait_zigbee_state()['level_ctrl']['command'] == 'commandStop'
