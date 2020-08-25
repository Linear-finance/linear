pragma solidity ^0.5.17;

contract LnAdmin {
    address public admin;
    address public superAdmin;

    constructor(address _admin) public {
        require(_admin != address(0), "admin address cannot be 0");
        admin = _admin;
        superAdmin = _admin;
        emit AdminChanged(address(0), _admin);
    }

    function changeAdmin(address _admin) external onlyAdmin {
        address old = admin;
        admin = _admin;
        emit AdminChanged( old, _admin);
    }

    function changeSuperAdmin( address _super ) external {
        require( msg.sender == superAdmin, "Only the contract super admin may perform this action");
        address old = superAdmin;
        superAdmin = _super;
        emit SuperAdminChanged( old, superAdmin ); 
    }

    modifier onlyAdmin {
        require( (msg.sender == admin) || (msg.sender == superAdmin), "Only the contract admin or super admin may perform this action");
        _;
    }

    event SuperAdminChanged(address oldSuper, address newSuper );
    event AdminChanged(address oldAdmin, address newAdmin);
}

