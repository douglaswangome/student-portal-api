codeunit 90100 "DW Student Service"
{
    procedure Ping(): Text
    begin
        exit('Pong from BC');
    end;

    procedure ListStudents(search: Text; skip: Integer; top: Integer): Text
    var
        Cust: Record Customer;
        Items: JsonArray;
        Errors: JsonObject;
        Term: Text;
        Total: Integer;
        Added: Integer;
    begin
        if top < 1 then
            top := 25;
        if top > 100 then
            top := 100;
        if skip < 0 then
            skip := 0;

        // Only real active students
        Cust.SetCurrentKey("No.");
        Cust.SetRange("Customer Type", Cust."Customer Type"::Student);
        Cust.SetRange("Blocked", Cust."Blocked"::" ");

        Term := UpperCase(DelChr(search, '<>', ' '));

        // No search text: the database counts and pages
        if Term = '' then begin
            Total := Cust.Count();
            if Cust.FindSet() then begin
                if skip > 0 then
                    if Cust.Next(skip) <> skip then
                        exit(ListResponse(Items, Total, skip, top)); // No more records to skip
                repeat
                    Items.Add(StudentToJson(Cust));
                    Added += 1;
                until (Cust.Next() = 0) or (Added >= top);
            end;
            exit(ListResponse(Items, Total, skip, top));
        end;

        if StrLen(Term) < 2 then begin
            AddError(Errors, 'search', 'Search term must be at least 2 characters long.');
            exit(ErrorResponse('VALIDATION_ERROR', 'The search term must be at least 2 characters long.', Errors));
        end;

        // Search text: compare in code, loading only the fields we search
        Cust.SetLoadFields("No.", Name, "ID No", "E-Mail", "Phone No.", "University Email");
        if Cust.FindSet() then
            repeat
                if MatchesSearch(Cust, Term) then begin
                    Total += 1;
                    if (Total > skip) and (Added < top) then begin
                        Items.Add(StudentToJson(Cust));
                        Added += 1;
                    end;
                end;
            until Cust.Next() = 0;

        exit(ListResponse(Items, Total, skip, top));
    end;

    procedure GetStudent(studentNo: Text): Text
    var
        Cust: Record Customer;
    begin
        if not FindStudent(studentNo, Cust) then
            exit(NotFoundResponse(studentNo));
        exit(OkResponse(StudentToJson(Cust)));
    end;

    procedure RegisterStudent(payload: Text): Text
    var
        Cust: Record Customer;
        Json: JsonObject;
        Errors: JsonObject;
    begin
        if not Json.ReadFrom(payload) then
            exit(ErrorResponse('BAD_REQUEST', 'The request body is not valid JSON.', Errors));

        Cust.Init();
        ApplyPayload(Cust, Json, Errors);
        ValidateStudent(Cust, Json, true, Errors);
        if HasErrors(Errors) then
            exit(ErrorResponse('VALIDATION_ERROR', 'Please correct the highlighted fields.', Errors));

        Cust."No." := NextStudentNo();
        SetNameFields(Cust);
        Cust."Date Registered" := Today();
        Cust."Customer Type" := Cust."Customer Type"::Student;
        Cust."Application Method" := Cust."Application Method"::"Apply to Oldest";
        Cust."Customer Posting Group" := 'STUDENT';
        Cust.Validate("Customer Posting Group");
        Cust.Insert(true);

        Cust.Get(Cust."No.");
        exit(OkResponse(StudentToJson(Cust)));
    end;

    procedure UpdateStudent(studentNo: Text; payload: Text): Text
    var
        Cust: Record Customer;
        JObj: JsonObject;
        Errors: JsonObject;
        Version: Text;
    begin
        if not JObj.ReadFrom(payload) then
            exit(ErrorResponse('BAD_REQUEST', 'The request body is not valid JSON.', Errors));

        if not FindStudent(studentNo, Cust) then
            exit(NotFoundResponse(studentNo));

        Version := GetText(JObj, 'version');
        if Version = '' then begin
            AddError(Errors, 'version', 'The version from the last read is required.');
            exit(ErrorResponse('VALIDATION_ERROR', 'The version is required to update a student.', Errors));
        end;
        if Version <> Format(Cust.SystemModifiedAt, 0, 9) then
            exit(ErrorResponse('CONFLICT', 'This student was changed by someone else. Reload and try again.', Errors));

        ApplyPayload(Cust, JObj, Errors);
        ValidateStudent(Cust, JObj, false, Errors);
        if HasErrors(Errors) then
            exit(ErrorResponse('VALIDATION_ERROR', 'Please correct the highlighted fields.', Errors));

        // Rebuilding the full name if any of the name fields were updated
        if JObj.Contains('firstName') or JObj.Contains('middleName') or JObj.Contains('lastName') then
            SetNameFields(Cust);

        Cust.Modify(true);

        Cust.Get(Cust."No.");
        exit(OkResponse(StudentToJson(Cust)));
    end;

    procedure GetLookups(): Text
    var
        Data: JsonObject;
    begin
        Data.Add('nationalities', LookupList(true));
        Data.Add('counties', LookupList(false));
        exit(OkResponse(Data));
    end;

    local procedure FindStudent(StudentNo: Text; var Cust: Record Customer): Boolean
    begin
        if (StudentNo = '') or (StrLen(StudentNo) > MaxStrLen(Cust."No.")) then
            exit(false);
        if not Cust.Get(StudentNo) then
            exit(false);
        // Safety check: refuse a student that is not active
        exit((Cust."Customer Type" = Cust."Customer Type"::Student) and (Cust.Blocked = Cust.Blocked::" "));
    end;

    procedure GetFeeStatement(studentNo: Text; fromDate: Text; toDate: Text): Text
    var
        Cust: Record Customer;
        TempBlob: Codeunit "Temp Blob";
        Base64: Codeunit "Base64 Convert";
        RecRef: RecordRef;
        Errors: JsonObject;
        Data: JsonObject;
        OutStr: OutStream;
        InStr: InStream;
        DateFrom: Date;
        DateTo: Date;
    begin
        if not FindStudent(studentNo, Cust) then
            exit(NotFoundResponse(studentNo));

        if fromDate <> '' then
            if not Evaluate(DateFrom, fromDate, 9) then
                AddError(Errors, 'from', 'Use the format YYYY-MM-DD.');
        if toDate <> '' then
            if not Evaluate(DateTo, toDate, 9) then
                AddError(Errors, 'to', 'Use the format YYYY-MM-DD.');
        if (DateFrom <> 0D) and (DateTo <> 0D) and (DateFrom > DateTo) then
            AddError(Errors, 'from', 'The start date must not be after the end date.');
        if HasErrors(Errors) then
            exit(ErrorResponse('VALIDATION_ERROR', 'Please correct the dates.', Errors));

        // The same two filters shown on the report's request page in BC
        Cust.SetRecFilter();
        if (DateFrom <> 0D) and (DateTo <> 0D) then
            Cust.SetFilter("Date Filter", '%1..%2', DateFrom, DateTo)
        else
            if DateFrom <> 0D then
                Cust.SetFilter("Date Filter", '%1..', DateFrom)
            else
                if DateTo <> 0D then
                    Cust.SetFilter("Date Filter", '..%1', DateTo);

        RecRef.GetTable(Cust);
        TempBlob.CreateOutStream(OutStr);
        Report.SaveAs(51072, '', ReportFormat::Pdf, OutStr, RecRef);

        if not TempBlob.HasValue() then
            exit(ErrorResponse('REPORT_EMPTY', 'Business Central produced an empty fee statement.', Errors));

        TempBlob.CreateInStream(InStr);
        AddText(Data, 'fileName', StrSubstNo('FeeStatement-%1.pdf', ConvertStr(Cust."No.", '/\', '--')));
        AddText(Data, 'contentType', 'application/pdf');
        AddText(Data, 'base64', Base64.ToBase64(InStr));
        exit(OkResponse(Data));
    end;

    // UpperTerm must already be upper case
    local procedure MatchesSearch(var Cust: Record Customer; UpperTerm: Text): Boolean
    begin
        exit(
            (StrPos(UpperCase(Cust."No."), UpperTerm) > 0) or
            (StrPos(UpperCase(Cust.Name), UpperTerm) > 0) or
            (StrPos(UpperCase(Cust."ID No"), UpperTerm) > 0) or
            (StrPos(UpperCase(Cust."E-Mail"), UpperTerm) > 0) or
            (StrPos(UpperCase(Cust."Phone No."), UpperTerm) > 0) or
            (StrPos(UpperCase(Cust."University Email"), UpperTerm) > 0));
    end;

    local procedure StudentNoPrefix(): Text
    begin
        exit('PRT-');
    end;

    // Creates numbers like PRT-000001. LockTable makes two simultaneous
    // registrations wait for each other so they cannot receive the same number.
    local procedure NextStudentNo(): Code[20]
    var
        Last: Record Customer;
        Taken: Record Customer;
        Seq: Integer;
        Candidate: Code[20];
    begin
        Last.LockTable();
        Last.SetFilter("No.", StudentNoPrefix() + '??????');
        if Last.FindLast() then
            if not Evaluate(Seq, CopyStr(Last."No.", StrLen(StudentNoPrefix()) + 1)) then
                Seq := 0;

        repeat
            Seq += 1;
            Candidate := CopyStr(StudentNoPrefix() + Format(Seq, 0, '<Integer,6><Filler Character,0>'), 1, MaxStrLen(Candidate));
        until not Taken.Get(Candidate);

        exit(Candidate);
    end;

    local procedure BuildFullName(var Cust: Record Customer): Text
    var
        Result: Text;
    begin
        Result := Cust."First Name";
        if Cust."Middle Name" <> '' then
            Result += ' ' + Cust."Middle Name";
        if Cust."Last Name" <> '' then
            Result += ' ' + Cust."Last Name";
        exit(Result);
    end;

    local procedure SetNameFields(var Cust: Record Customer)
    begin
        Cust.Name := CopyStr(BuildFullName(Cust), 1, MaxStrLen(Cust.Name));
        Cust."Search Name" := CopyStr(UpperCase(Cust.Name), 1, MaxStrLen(Cust."Search Name"));
    end;

    local procedure ApplyPayload(var Cust: Record Customer; JObj: JsonObject; var Errors: JsonObject)
    var
        Value: Text;
        Dob: Date;
    begin
        if JObj.Contains('firstName') then begin
            Value := GetText(JObj, 'firstName');
            if CheckLength(Value, MaxStrLen(Cust."First Name"), 'firstName', Errors) then
                Cust."First Name" := Value;
        end;

        if JObj.Contains('middleName') then begin
            Value := GetText(JObj, 'middleName');
            if CheckLength(Value, MaxStrLen(Cust."Middle Name"), 'middleName', Errors) then
                Cust."Middle Name" := Value;
        end;

        if JObj.Contains('lastName') then begin
            Value := GetText(JObj, 'lastName');
            if CheckLength(Value, MaxStrLen(Cust."Last Name"), 'lastName', Errors) then
                Cust."Last Name" := Value;
        end;

        if JObj.Contains('gender') then
            case LowerCase(GetText(JObj, 'gender')) of
                'male':
                    Cust.Gender := Cust.Gender::Male;
                'female':
                    Cust.Gender := Cust.Gender::Female;
                '':
                    Cust.Gender := Cust.Gender::" ";
                else
                    AddError(Errors, 'gender', 'Choose Male or Female.');
            end;

        if JObj.Contains('dateOfBirth') then begin
            Value := GetText(JObj, 'dateOfBirth');
            if Value = '' then
                Cust."Date Of Birth" := 0D
            else
                if Evaluate(Dob, Value, 9) then
                    Cust."Date Of Birth" := Dob
                else
                    AddError(Errors, 'dateOfBirth', 'Use the format YYYY-MM-DD.');
        end;

        if JObj.Contains('idNumber') then begin
            Value := GetText(JObj, 'idNumber');
            if CheckLength(Value, MaxStrLen(Cust."ID No"), 'idNumber', Errors) then
                Cust."ID No" := Value;
        end;

        if JObj.Contains('nationality') then begin
            Value := UpperCase(GetText(JObj, 'nationality'));
            if CheckLength(Value, MaxStrLen(Cust.Nationality), 'nationality', Errors) then
                Cust.Nationality := Value;
        end;

        if JObj.Contains('county') then begin
            Value := UpperCase(GetText(JObj, 'county'));
            if CheckLength(Value, MaxStrLen(Cust.County), 'county', Errors) then
                Cust.County := Value;
        end;

        if JObj.Contains('phone') then begin
            Value := DelChr(GetText(JObj, 'phone'), '=', ' -()');
            if CheckLength(Value, MaxStrLen(Cust."Phone No."), 'phone', Errors) then
                Cust."Phone No." := Value;
        end;

        if JObj.Contains('alternatePhone') then begin
            Value := DelChr(GetText(JObj, 'alternatePhone'), '=', ' -()');
            if CheckLength(Value, MaxStrLen(Cust."Alternate Mobile"), 'alternatePhone', Errors) then
                Cust."Alternate Mobile" := Value;
        end;

        if JObj.Contains('email') then begin
            Value := LowerCase(GetText(JObj, 'email'));
            if CheckLength(Value, MaxStrLen(Cust."E-Mail"), 'email', Errors) then
                Cust."E-Mail" := Value;
        end;

        if JObj.Contains('postalAddress') then begin
            Value := GetText(JObj, 'postalAddress');
            if CheckLength(Value, MaxStrLen(Cust.Address), 'postalAddress', Errors) then
                Cust.Address := Value;
        end;
    end;

    local procedure ValidateStudent(var Cust: Record Customer; JObj: JsonObject; IsNew: Boolean; var Errors: JsonObject)
    begin
        if ShouldCheck(IsNew, JObj, 'firstName') and (Cust."First Name" = '') then
            AddError(Errors, 'firstName', 'First name is required.');

        if ShouldCheck(IsNew, JObj, 'lastName') and (Cust."Last Name" = '') then
            AddError(Errors, 'lastName', 'Last name is required.');

        if ShouldCheck(IsNew, JObj, 'gender') and (Cust.Gender = Cust.Gender::" ") then
            AddError(Errors, 'gender', 'Gender is required.');

        if ShouldCheck(IsNew, JObj, 'dateOfBirth') then
            CheckDateOfBirth(Cust."Date Of Birth", Errors);

        if ShouldCheck(IsNew, JObj, 'idNumber') then begin
            if Cust."ID No" = '' then
                AddError(Errors, 'idNumber', 'ID number is required.')
            else
                if IdNumberTaken(Cust."ID No", Cust."No.") then
                    AddError(Errors, 'idNumber', 'Another record already uses this ID number.');
        end;

        if ShouldCheck(IsNew, JObj, 'phone') then begin
            if Cust."Phone No." = '' then
                AddError(Errors, 'phone', 'Phone number is required.')
            else
                if not IsValidPhone(Cust."Phone No.") then
                    AddError(Errors, 'phone', 'Enter a valid phone number, for example 0712345678 or +254712345678.');
        end;

        if JObj.Contains('alternatePhone') and (Cust."Alternate Mobile" <> '') then
            if not IsValidPhone(Cust."Alternate Mobile") then
                AddError(Errors, 'alternatePhone', 'Enter a valid phone number.');

        if JObj.Contains('email') and (Cust."E-Mail" <> '') then
            if not IsValidEmail(Cust."E-Mail") then
                AddError(Errors, 'email', 'Enter a valid email address.');

        if JObj.Contains('nationality') and (Cust.Nationality <> '') then
            if not SetupCodeExists(true, Cust.Nationality) then
                AddError(Errors, 'nationality', 'Unknown nationality code.');

        if JObj.Contains('county') and (Cust.County <> '') then
            if not SetupCodeExists(false, Cust.County) then
                AddError(Errors, 'county', 'Unknown county code.');
    end;

    local procedure ShouldCheck(IsNew: Boolean; JObj: JsonObject; PropName: Text): Boolean
    begin
        exit(IsNew or JObj.Contains(PropName));
    end;

    local procedure CheckLength(Value: Text; MaxLen: Integer; PropName: Text; var Errors: JsonObject): Boolean
    begin
        if StrLen(Value) <= MaxLen then
            exit(true);
        AddError(Errors, PropName, StrSubstNo('Maximum %1 characters.', MaxLen));
        exit(false);
    end;

    local procedure CheckDateOfBirth(Dob: Date; var Errors: JsonObject)
    var
        MinAgeYears: Integer;
    begin
        MinAgeYears := 13;
        if Dob = 0D then begin
            AddError(Errors, 'dateOfBirth', 'Date of birth is required.');
            exit;
        end;
        if Dob > Today() then begin
            AddError(Errors, 'dateOfBirth', 'Date of birth cannot be in the future.');
            exit;
        end;
        if Dob < 19000101D then begin
            AddError(Errors, 'dateOfBirth', 'Date of birth is too far in the past.');
            exit;
        end;
        if Dob > CalcDate(StrSubstNo('<-%1Y>', MinAgeYears), Today()) then
            AddError(Errors, 'dateOfBirth', StrSubstNo('A student must be at least %1 years old.', MinAgeYears));
    end;

    local procedure IdNumberTaken(IdNo: Code[20]; OwnNo: Code[20]): Boolean
    var
        Other: Record Customer;
    begin
        Other.SetRange("ID No", IdNo);
        if OwnNo <> '' then
            Other.SetFilter("No.", '<>%1', OwnNo);
        exit(not Other.IsEmpty());
    end;

    local procedure IsValidPhone(Phone: Text): Boolean
    var
        Digits: Text;
    begin
        if Phone = '' then
            exit(false);
        if CopyStr(Phone, 1, 1) = '+' then
            Digits := CopyStr(Phone, 2)
        else
            Digits := Phone;
        if (StrLen(Digits) < 9) or (StrLen(Digits) > 15) then
            exit(false);
        exit(DelChr(Digits, '=', '0123456789') = '');
    end;

    local procedure IsValidEmail(Email: Text): Boolean
    var
        AtPos: Integer;
        DomainPart: Text;
    begin
        if (Email = '') or (StrPos(Email, ' ') > 0) then
            exit(false);
        AtPos := StrPos(Email, '@');
        if AtPos < 2 then
            exit(false);
        DomainPart := CopyStr(Email, AtPos + 1);
        if StrPos(DomainPart, '@') > 0 then
            exit(false);
        if StrPos(DomainPart, '.') < 2 then
            exit(false);
        exit(CopyStr(Email, StrLen(Email), 1) <> '.');
    end;

    local procedure SetupCodeExists(Nationality: Boolean; SetupCode: Text): Boolean
    var
        Setup: Record "ACA-Academics Central Setups";
    begin
        if Nationality then
            Setup.SetRange(Category, Setup.Category::Nationality)
        else
            Setup.SetRange(Category, Setup.Category::Counties);
        Setup.SetRange("Title Code", CopyStr(UpperCase(SetupCode), 1, MaxStrLen(Setup."Title Code")));
        exit(not Setup.IsEmpty());
    end;

    local procedure LookupList(Nationality: Boolean) Result: JsonArray
    var
        Setup: Record "ACA-Academics Central Setups";
        Item: JsonObject;
    begin
        if Nationality then
            Setup.SetRange(Category, Setup.Category::Nationality)
        else
            Setup.SetRange(Category, Setup.Category::Counties);
        if Setup.FindSet() then
            repeat
                Clear(Item);
                AddText(Item, 'code', Setup."Title Code");
                AddText(Item, 'name', Setup.Description);
                Result.Add(Item);
            until Setup.Next() = 0;
    end;

    local procedure StudentToJson(var Cust: Record Customer) JObj: JsonObject
    begin
        Cust.CalcFields(countryName, "County of Origin");
        AddText(JObj, 'studentNo', Cust."No.");
        AddText(JObj, 'firstName', Cust."First Name");
        AddText(JObj, 'middleName', Cust."Middle Name");
        AddText(JObj, 'lastName', Cust."Last Name");
        AddText(JObj, 'fullName', Cust.Name);
        AddText(JObj, 'gender', DelChr(Format(Cust.Gender), '<>', ' '));
        AddText(JObj, 'dateOfBirth', DateToText(Cust."Date Of Birth"));
        AddText(JObj, 'idNumber', Cust."ID No");
        AddText(JObj, 'nationality', Cust.Nationality);
        AddText(JObj, 'nationalityName', Cust.countryName);
        AddText(JObj, 'county', Cust.County);
        AddText(JObj, 'countyName', Cust."County of Origin");
        AddText(JObj, 'phone', Cust."Phone No.");
        AddText(JObj, 'alternatePhone', Cust."Alternate Mobile");
        AddText(JObj, 'email', Cust."E-Mail");
        AddText(JObj, 'universityEmail', Cust."University Email");
        AddText(JObj, 'postalAddress', Cust.Address);
        AddText(JObj, 'status', Format(Cust.Status));
        AddText(JObj, 'dateRegistered', DateToText(Cust."Date Registered"));
        AddText(JObj, 'version', Format(Cust.SystemModifiedAt, 0, 9));
    end;

    local procedure DateToText(D: Date): Text
    begin
        if D = 0D then
            exit('');
        exit(Format(D, 0, 9));
    end;

    local procedure AddText(var JObj: JsonObject; PropName: Text; Value: Text)
    begin
        JObj.Add(PropName, Value);
    end;

    local procedure GetText(JObj: JsonObject; PropName: Text): Text
    var
        Tok: JsonToken;
        JVal: JsonValue;
    begin
        if not JObj.Get(PropName, Tok) then
            exit('');
        if not Tok.IsValue() then
            exit('');
        JVal := Tok.AsValue();
        if JVal.IsNull() then
            exit('');
        exit(DelChr(JVal.AsText(), '<>', ' '));
    end;

    local procedure AddError(var Errors: JsonObject; FieldName: Text; ErrText: Text)
    begin
        if not Errors.Contains(FieldName) then
            Errors.Add(FieldName, ErrText);
    end;

    local procedure HasErrors(Errors: JsonObject): Boolean
    begin
        exit(Errors.Keys().Count() > 0);
    end;

    local procedure OkResponse(Data: JsonObject): Text
    var
        Response: JsonObject;
        Txt: Text;
    begin
        Response.Add('ok', true);
        Response.Add('data', Data);
        Response.WriteTo(Txt);
        exit(Txt);
    end;

    local procedure ListResponse(Items: JsonArray; Total: Integer; SkipCount: Integer; TopCount: Integer): Text
    var
        Data: JsonObject;
    begin
        Data.Add('total', Total);
        Data.Add('skip', SkipCount);
        Data.Add('top', TopCount);
        Data.Add('items', Items);
        exit(OkResponse(Data));
    end;

    local procedure ErrorResponse(ErrCode: Text; ErrMessage: Text; FieldErrors: JsonObject): Text
    var
        Response: JsonObject;
        Err: JsonObject;
        Txt: Text;
    begin
        Err.Add('code', ErrCode);
        Err.Add('message', ErrMessage);
        Err.Add('fields', FieldErrors);
        Response.Add('ok', false);
        Response.Add('error', Err);
        Response.WriteTo(Txt);
        exit(Txt);
    end;

    local procedure NotFoundResponse(StudentNo: Text): Text
    var
        NoFields: JsonObject;
    begin
        exit(ErrorResponse('NOT_FOUND', StrSubstNo('No active student with number %1 was found.', StudentNo), NoFields));
    end;
}