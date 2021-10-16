#ifndef BUTTONHANDLER_H
#define BUTTONHANDLER_H

#include "ButtonModes.h"
#include "IButtonHandler.h"
#include "AppQueue.h"

#include <jendefs.h>

class ButtonHandler: public IButtonHandler
{
    uint32 currentStateDuration;

    SwitchType switchType;
    LocalSwitchMode switchMode;
    uint16 maxPause;
    uint16 longPressDuration;

    enum ButtonState
    {
        IDLE,
        PRESSED1,
        PAUSE1,
        PRESSED2,
        PAUSE2,
        PRESSED3,
        LONG_PRESS
    };

    ButtonState currentState;

public:
    ButtonHandler();

    void setSwitchType(SwitchType type);
    void setLocalSwitchMode(LocalSwitchMode mode);
    void setMaxPause(uint16 value);
    void setMinLongPress(uint16 value);

protected:
    virtual void handleButtonState(bool pressed);
    virtual void resetButtonStateMachine();

    virtual void changeState(ButtonState state);
    virtual void buttonStateMachineToggle(bool pressed);
    virtual void buttonStateMachineMomentary(bool pressed);
    virtual void buttonStateMachineMultifunction(bool pressed);
    void sendButtonEvent(ApplicationEventType evtType, uint8 button);

    const char * getStateName(ButtonState state);
};

#endif // BUTTONHANDLER_H
